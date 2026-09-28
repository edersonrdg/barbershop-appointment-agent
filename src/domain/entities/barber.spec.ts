import { InvalidBarberServiceError } from '../errors/invalid-barber-service.error';
import { InvalidBarberUserError } from '../errors/invalid-barber-user.error';
import { DayWorkingHours } from '../value-objects/day-working-hours';
import { ServiceDuration } from '../value-objects/service-duration';
import { ServicePrice } from '../value-objects/service-price';
import { TimeOfDay } from '../value-objects/time-of-day';
import { WEEKDAYS, Weekday } from '../value-objects/weekday';
import { WeeklyWorkingHours } from '../value-objects/weekly-working-hours';
import { Barber } from './barber';
import { BarbershopService } from './barbershop-service';
import { User } from './user';

const NOW = new Date('2026-09-28T12:00:00.000Z');

function weekdaysFrom(startsAt: string, endsAt: string): WeeklyWorkingHours {
  return WeeklyWorkingHours.create(
    Object.fromEntries(
      WEEKDAYS.map((weekday) => [
        weekday,
        weekday === 'saturday' || weekday === 'sunday'
          ? null
          : DayWorkingHours.create({
              weekday,
              startsAt: TimeOfDay.create(startsAt),
              endsAt: TimeOfDay.create(endsAt),
            }),
      ]),
    ) as Record<Weekday, DayWorkingHours | null>,
  );
}

function buildService(
  id: string,
  { barbershopId = 'barbershop-a', active = true } = {},
): BarbershopService {
  const service = BarbershopService.create({
    id,
    barbershopId,
    name: id,
    price: ServicePrice.create(4500),
    duration: ServiceDuration.create(30),
    now: NOW,
  });
  if (!active) service.deactivate();
  return service;
}

function buildUser(
  id: string,
  role: 'owner' | 'barber',
  barbershopId = 'barbershop-a',
): User {
  return User.restore({
    id,
    barbershopId,
    name: 'João Pereira',
    email: `${id}@example.com`,
    phone: null,
    passwordHash: 'hash',
    role,
    createdAt: NOW,
  });
}

function buildBarber(): Barber {
  return Barber.create({
    id: 'barber-1',
    barbershopId: 'barbershop-a',
    name: 'João',
    workingHours: weekdaysFrom('09:00', '18:00'),
    now: NOW,
  });
}

function describeBarber(barber: Barber) {
  return {
    id: barber.id,
    barbershopId: barber.barbershopId,
    name: barber.name,
    active: barber.active,
    userId: barber.userId,
    serviceIds: [...barber.serviceIds],
    mondayStartsAt: barber.workingHours.forDay('monday')?.startsAt.toString(),
    createdAt: barber.createdAt,
  };
}

describe('Barber', () => {
  it('CA-05.1: a new barber is active, has no services nor user and carries the given values', () => {
    expect(describeBarber(buildBarber())).toEqual({
      id: 'barber-1',
      barbershopId: 'barbershop-a',
      name: 'João',
      active: true,
      userId: null,
      serviceIds: [],
      mondayStartsAt: '09:00',
      createdAt: NOW,
    });
  });

  describe('CA-05.1: services performed', () => {
    it('keeps the service ids in the given order', () => {
      const barber = buildBarber();

      barber.changeServices([buildService('beard'), buildService('haircut')]);

      expect(barber.serviceIds).toEqual(['beard', 'haircut']);
    });

    it('replaces the previous list', () => {
      const barber = buildBarber();
      barber.changeServices([buildService('beard')]);

      barber.changeServices([buildService('haircut')]);

      expect(barber.serviceIds).toEqual(['haircut']);
    });

    it.each([
      [
        'an empty list',
        [] as BarbershopService[],
        'Informe pelo menos um serviço realizado.',
      ],
      [
        'a service of another barbershop',
        [buildService('foreign', { barbershopId: 'barbershop-b' })],
        'Serviço não encontrado.',
      ],
      [
        'an inactive service',
        [buildService('old', { active: false })],
        'Os serviços realizados devem estar ativos.',
      ],
    ])(
      'rejects %s with InvalidBarberServiceError and keeps the services',
      (_case, services, message) => {
        const barber = buildBarber();
        barber.changeServices([buildService('haircut')]);

        expect(() => barber.changeServices(services)).toThrow(
          new InvalidBarberServiceError(message),
        );
        expect(barber.serviceIds).toEqual(['haircut']);
      },
    );
  });

  describe('CA-05.2: link with a panel user', () => {
    it.each([
      ['a barber', 'barber'],
      ['the owner', 'owner'],
    ] as const)('links %s of the same barbershop', (_case, role) => {
      const barber = buildBarber();

      barber.linkUser(buildUser('user-1', role));

      expect(barber.userId).toBe('user-1');
    });

    it('unlinks with null', () => {
      const barber = buildBarber();
      barber.linkUser(buildUser('user-1', 'barber'));

      barber.linkUser(null);

      expect(barber.userId).toBeNull();
    });

    it('rejects a user of another barbershop with InvalidBarberUserError and keeps the link', () => {
      const barber = buildBarber();
      barber.linkUser(buildUser('user-1', 'barber'));

      expect(() =>
        barber.linkUser(buildUser('user-2', 'barber', 'barbershop-b')),
      ).toThrow(new InvalidBarberUserError());
      expect(barber.userId).toBe('user-1');
    });

    it('carries the message "Usuário não encontrado."', () => {
      expect(new InvalidBarberUserError().message).toBe(
        'Usuário não encontrado.',
      );
    });
  });

  it('CA-05.1: update replaces name and working hours and keeps active false', () => {
    const barber = buildBarber();
    barber.deactivate();

    barber.update({
      name: 'João Silva',
      workingHours: weekdaysFrom('10:00', '19:00'),
    });

    expect(barber.name).toBe('João Silva');
    expect(barber.workingHours.forDay('monday')?.startsAt.toString()).toBe(
      '10:00',
    );
    expect(barber.active).toBe(false);
  });

  describe('deactivate and activate', () => {
    function linkedBarber(): Barber {
      const barber = buildBarber();
      barber.changeServices([buildService('haircut')]);
      barber.linkUser(buildUser('user-1', 'barber'));
      return barber;
    }

    it('deactivate changes only the active flag', () => {
      const barber = linkedBarber();
      const before = describeBarber(barber);

      barber.deactivate();

      expect(describeBarber(barber)).toEqual({ ...before, active: false });
    });

    it('activate brings an inactive barber back and changes nothing else', () => {
      const barber = linkedBarber();
      barber.deactivate();
      const before = describeBarber(barber);

      barber.activate();

      expect(describeBarber(barber)).toEqual({ ...before, active: true });
    });

    it('repeating either is idempotent', () => {
      const barber = linkedBarber();

      barber.activate();
      expect(barber.active).toBe(true);
      barber.deactivate();
      barber.deactivate();
      expect(barber.active).toBe(false);
    });
  });
});
