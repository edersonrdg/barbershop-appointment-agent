import { AppointmentOrigin } from '../../domain/entities/appointment';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { DomainError } from '../../domain/errors/domain.error';
import { InvalidValueError } from '../../domain/errors/invalid-value.error';
import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { ServiceNotPerformedError } from '../../domain/errors/service-not-performed.error';
import { AvailableSlot } from '../../domain/value-objects/barber-day-schedule';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { day, seedBarber, workingHoursInput } from '../testing/barber-fixtures';
import {
  at,
  MONDAY,
  rulesWithMinimumAdvance,
  setupScheduling,
  TUESDAY,
} from '../testing/scheduling-fixtures';
import {
  ListAvailableSlotsInput,
  ListAvailableSlotsUseCase,
} from './list-available-slots.use-case';

// Sunday before MONDAY: nothing on MONDAY is in the past nor inside the advance.
const SUNDAY_NOON = new Date('2026-10-04T12:00:00.000Z');

async function setup(now = SUNDAY_NOON) {
  const env = await setupScheduling(now);
  const useCase = new ListAvailableSlotsUseCase(
    env.barbershops,
    env.bookingRules,
    env.barbers,
    env.services,
    env.appointments,
    env.blocks,
    env.clock,
  );
  return { ...env, useCase };
}

function input(
  overrides: Partial<ListAvailableSlotsInput> = {},
): ListAvailableSlotsInput {
  return {
    barbershopId: 'barbershop-a',
    barberId: 'ana',
    serviceIds: ['haircut'],
    date: MONDAY,
    origin: 'manual',
    ...overrides,
  };
}

const starts = (slots: AvailableSlot[]): Date[] =>
  slots.map((slot) => slot.startsAt);

/** Every 30 minutes from `from` to `to`, both included, on MONDAY. */
function grid(from: string, to: string): Date[] {
  const result: Date[] = [];
  for (let time = at(from); time <= at(to);) {
    result.push(time);
    time = new Date(time.getTime() + 30 * 60 * 1000);
  }
  return result;
}

async function expectError(
  attempt: Promise<unknown>,
  errorType: new (...args: never[]) => DomainError,
  message: string,
): Promise<void> {
  await expect(attempt).rejects.toBeInstanceOf(errorType);
  await expect(attempt).rejects.toThrow(message);
}

describe('ListAvailableSlotsUseCase', () => {
  describe('CA-07.1: slots of one barber', () => {
    it('CA-07.1: returns only the starts where 30 + 15 min fit, with barber, start and end in UTC, in order (AVL-01 to AVL-05, AVL-08)', async () => {
      const { useCase, barbers, appointments, blocks } = await setup();
      await seedBarber(barbers, {
        id: 'ana',
        name: 'Ana',
        serviceIds: ['haircut', 'beard'],
        workingHours: workingHoursInput({ monday: day('10:00', '17:00') }),
      });
      appointments.seed({
        barbershopId: 'barbershop-a',
        barberId: 'ana',
        start: at('14:00'),
        end: at('14:45'),
      });
      blocks.seed({
        barbershopId: 'barbershop-a',
        barberId: 'ana',
        start: at('15:30'),
        end: at('16:00'),
      });

      const slots = await useCase.execute(
        input({ serviceIds: ['haircut', 'beard'] }),
      );

      expect(slots).toEqual([
        { barberId: 'ana', startsAt: at('10:00'), endsAt: at('10:45') },
        { barberId: 'ana', startsAt: at('10:30'), endsAt: at('11:15') },
        { barberId: 'ana', startsAt: at('11:00'), endsAt: at('11:45') },
        { barberId: 'ana', startsAt: at('13:00'), endsAt: at('13:45') },
        { barberId: 'ana', startsAt: at('14:45'), endsAt: at('15:30') },
        { barberId: 'ana', startsAt: at('16:00'), endsAt: at('16:45') },
      ]);
    });

    it('CA-07.1: reads the date and the hours in the timezone of the barbershop (AVL-09)', async () => {
      const { useCase, barbers, barbershopA } = await setup();
      barbershopA.updateSettings({
        name: barbershopA.name,
        address: 'Rua das Flores, 123',
        timezone: BarbershopTimezone.create('America/Manaus'),
        openingHours: barbershopA.openingHours,
      });
      await seedBarber(barbers, {
        id: 'ana',
        name: 'Ana',
        workingHours: workingHoursInput({ monday: day('09:00', '10:00') }),
      });

      const slots = await useCase.execute(input());

      expect(starts(slots)).toEqual([
        new Date('2026-10-05T13:00:00.000Z'),
        new Date('2026-10-05T13:30:00.000Z'),
      ]);
    });

    it('CA-07.1: a day when the barbershop is closed returns an empty list (AVL-07)', async () => {
      const { useCase, barbers } = await setup();
      await seedBarber(barbers, {
        id: 'ana',
        name: 'Ana',
        workingHours: workingHoursInput({
          monday: day('09:00', '18:00'),
          wednesday: day('09:00', '18:00'),
        }),
      });

      expect(await useCase.execute(input({ date: '2026-10-07' }))).toEqual([]);
    });

    it('CA-07.1: a day the barber does not work returns an empty list (AVL-07)', async () => {
      const { useCase, barbers } = await setup();
      await seedBarber(barbers, {
        id: 'ana',
        name: 'Ana',
        workingHours: workingHoursInput({ monday: day('09:00', '18:00') }),
      });

      expect(await useCase.execute(input({ date: TUESDAY }))).toEqual([]);
    });

    it('CA-07.1: a date in the past returns an empty list', async () => {
      const { useCase, barbers } = await setup(at('10:00', '2026-10-12'));
      await seedBarber(barbers, {
        id: 'ana',
        name: 'Ana',
        workingHours: workingHoursInput({ monday: day('09:00', '18:00') }),
      });

      expect(await useCase.execute(input({ date: MONDAY }))).toEqual([]);
    });
  });

  describe('CA-07.2: any barber', () => {
    it('CA-07.2: offers each start once with the first free barber by name, leaving out inactive barbers and those who do not perform the service (AVL-10 to AVL-12)', async () => {
      const { useCase, barbers, appointments } = await setup();
      const tenToNoon = workingHoursInput({ monday: day('10:00', '12:00') });
      await seedBarber(barbers, {
        id: 'davi',
        name: 'Davi',
        serviceIds: ['beard'],
        workingHours: tenToNoon,
      });
      await seedBarber(barbers, {
        id: 'bruno',
        name: 'Bruno',
        workingHours: tenToNoon,
      });
      await seedBarber(barbers, {
        id: 'caio',
        name: 'Caio',
        active: false,
        workingHours: tenToNoon,
      });
      await seedBarber(barbers, {
        id: 'ana',
        name: 'Ana',
        workingHours: tenToNoon,
      });
      const busy = (barberId: string, start: string, end: string) =>
        appointments.seed({
          barbershopId: 'barbershop-a',
          barberId,
          start: at(start),
          end: at(end),
        });
      busy('ana', '10:00', '10:30');
      busy('ana', '11:00', '11:30');
      busy('bruno', '11:00', '11:30');

      const slots = await useCase.execute(input({ barberId: null }));

      expect(slots).toEqual([
        { barberId: 'bruno', startsAt: at('10:00'), endsAt: at('10:30') },
        { barberId: 'ana', startsAt: at('10:30'), endsAt: at('11:00') },
        { barberId: 'ana', startsAt: at('11:30'), endsAt: at('12:00') },
      ]);
    });

    it('CA-07.2: only barbers who perform every requested service are considered (AVL-10, AVL-12)', async () => {
      const { useCase, barbers } = await setup();
      const tenToEleven = workingHoursInput({ monday: day('10:00', '11:00') });
      await seedBarber(barbers, {
        id: 'ana',
        name: 'Ana',
        serviceIds: ['haircut'],
        workingHours: tenToEleven,
      });
      await seedBarber(barbers, {
        id: 'bruno',
        name: 'Bruno',
        serviceIds: ['haircut', 'beard'],
        workingHours: tenToEleven,
      });

      const slots = await useCase.execute(
        input({ barberId: null, serviceIds: ['haircut', 'beard'] }),
      );

      expect(slots).toEqual([
        { barberId: 'bruno', startsAt: at('10:00'), endsAt: at('10:45') },
      ]);
    });

    it('CA-07.2: returns an empty list when no active barber performs every service (AVL-13)', async () => {
      const { useCase, barbers } = await setup();
      await seedBarber(barbers, {
        id: 'ana',
        name: 'Ana',
        serviceIds: ['haircut'],
      });
      await seedBarber(barbers, {
        id: 'caio',
        name: 'Caio',
        active: false,
        serviceIds: ['beard'],
      });

      expect(
        await useCase.execute(input({ barberId: null, serviceIds: ['beard'] })),
      ).toEqual([]);
    });
  });

  describe('CA-07.3: minimum advance by origin', () => {
    async function nineToNoon(now: Date) {
      const env = await setup(now);
      await seedBarber(env.barbers, {
        id: 'ana',
        name: 'Ana',
        workingHours: workingHoursInput({ monday: day('09:00', '12:00') }),
      });
      return env;
    }

    it.each<[AppointmentOrigin, Date[]]>([
      ['bot', grid('11:30', '11:30')],
      ['manual', grid('10:30', '11:30')],
    ])(
      'CA-07.3: at 10:05 with 60 min of advance, %s gets the grid from the right start (AVL-14, AVL-15)',
      async (origin, expected) => {
        const { useCase } = await nineToNoon(at('10:05'));

        expect(starts(await useCase.execute(input({ origin })))).toEqual(
          expected,
        );
      },
    );

    it('CA-07.3: a start exactly at now + minimum advance (bot) or exactly now (manual) is offered (AVL-16)', async () => {
      const { useCase } = await nineToNoon(at('10:00'));

      expect(starts(await useCase.execute(input({ origin: 'bot' })))).toEqual(
        grid('11:00', '11:30'),
      );
      expect(
        starts(await useCase.execute(input({ origin: 'manual' }))),
      ).toEqual(grid('10:00', '11:30'));
    });

    it('CA-07.3: a changed minimum advance applies to the next query (AVL-17)', async () => {
      const { useCase, bookingRules } = await nineToNoon(at('09:00'));
      const before = await useCase.execute(input({ origin: 'bot' }));

      await bookingRules.save('barbershop-a', rulesWithMinimumAdvance(120));
      const after = await useCase.execute(input({ origin: 'bot' }));

      expect(starts(before)).toEqual(grid('10:00', '11:30'));
      expect(starts(after)).toEqual(grid('11:00', '11:30'));
    });

    it('CA-07.3: a barbershop without saved rules uses the default 60 minutes', async () => {
      const { useCase, store } = await nineToNoon(at('09:00'));
      store.bookingRules.delete('barbershop-a');

      expect(starts(await useCase.execute(input({ origin: 'bot' })))).toEqual(
        grid('10:00', '11:30'),
      );
    });
  });

  describe('RN-26: barber, services and isolation', () => {
    async function withAna() {
      const env = await setup();
      await seedBarber(env.barbers, {
        id: 'ana',
        name: 'Ana',
        serviceIds: ['haircut'],
      });
      await seedBarber(env.barbers, {
        id: 'bia',
        name: 'Bia',
        active: false,
      });
      await seedBarber(env.barbers, {
        id: 'zeca',
        name: 'Zeca',
        barbershopId: 'barbershop-b',
        serviceIds: ['foreign'],
      });
      return env;
    }

    it.each(['ghost', 'bia', 'zeca'])(
      'AVL-32: barber %s (missing, inactive or of another barbershop) is "Barbeiro não encontrado."',
      async (barberId) => {
        const { useCase } = await withAna();

        await expectError(
          useCase.execute(input({ barberId })),
          BarberNotFoundError,
          'Barbeiro não encontrado.',
        );
      },
    );

    it.each(['ghost', 'old', 'foreign'])(
      'AVL-33: service %s (missing, inactive or of another barbershop) is "Serviço não encontrado."',
      async (serviceId) => {
        const { useCase } = await withAna();

        for (const barberId of ['ana', null]) {
          await expectError(
            useCase.execute(
              input({ barberId, serviceIds: ['haircut', serviceId] }),
            ),
            ServiceNotFoundError,
            'Serviço não encontrado.',
          );
        }
      },
    );

    it('CA-07.5: a barber who does not perform every service is refused (AVL-34)', async () => {
      const { useCase } = await withAna();

      await expectError(
        useCase.execute(input({ serviceIds: ['haircut', 'beard'] })),
        ServiceNotPerformedError,
        'O barbeiro não realiza todos os serviços escolhidos.',
      );
    });

    it.each<[string, string[], string]>([
      ['an empty list', [], 'Escolha pelo menos um serviço.'],
      [
        'a repeated service',
        ['haircut', 'haircut'],
        'Escolha cada serviço uma única vez.',
      ],
    ])(
      'CA-07.5: %s of services is an invalid value (AVL-35)',
      async (_, serviceIds, message) => {
        const { useCase } = await withAna();

        await expectError(
          useCase.execute(input({ serviceIds })),
          InvalidValueError,
          message,
        );
      },
    );

    it.each(['2026-02-30', '05/10/2026', '2026-10-5'])(
      'CA-07.1: date %s is "Data inválida."',
      async (date) => {
        const { useCase } = await withAna();

        for (const barberId of ['ana', null]) {
          await expectError(
            useCase.execute(input({ barberId, date })),
            InvalidValueError,
            'Data inválida.',
          );
        }
      },
    );

    it('RN-26: blocks and appointments of another barbershop with the same barber id do not remove slots (AVL-36)', async () => {
      const { useCase, barbers, appointments, blocks } = await setup();
      await seedBarber(barbers, {
        id: 'ana',
        name: 'Ana',
        workingHours: workingHoursInput({ monday: day('09:00', '10:00') }),
      });
      appointments.seed({
        barbershopId: 'barbershop-b',
        barberId: 'ana',
        start: at('09:00'),
        end: at('09:30'),
      });
      blocks.seed({
        barbershopId: 'barbershop-b',
        barberId: 'ana',
        start: at('09:30'),
        end: at('10:00'),
      });

      expect(starts(await useCase.execute(input()))).toEqual(
        grid('09:00', '09:30'),
      );
    });
  });
});
