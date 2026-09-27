import { Barbershop } from '../../domain/entities/barbershop';
import { InvalidOpeningHoursError } from '../../domain/errors/invalid-opening-hours.error';
import { Weekday, WEEKDAYS } from '../../domain/value-objects/weekday';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import {
  DayOpeningHoursInput,
  UpdateBarbershopSettingsInput,
  UpdateBarbershopSettingsUseCase,
} from './update-barbershop-settings.use-case';

const NOW = new Date('2026-09-27T12:00:00.000Z');

interface SavedSettings {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  openingHours: Record<Weekday, DayOpeningHoursInput | null>;
}

function describeSettings(barbershop: Barbershop): SavedSettings {
  const openingHours = Object.fromEntries(
    WEEKDAYS.map((weekday) => {
      const day = barbershop.openingHours.forDay(weekday);
      return [
        weekday,
        day
          ? {
              opensAt: day.opensAt.toString(),
              closesAt: day.closesAt.toString(),
              break: day.break
                ? {
                    startsAt: day.break.startsAt.toString(),
                    endsAt: day.break.endsAt.toString(),
                  }
                : null,
            }
          : null,
      ];
    }),
  ) as Record<Weekday, DayOpeningHoursInput | null>;
  return {
    id: barbershop.id,
    name: barbershop.name,
    address: barbershop.address,
    timezone: barbershop.timezone,
    openingHours,
  };
}

class RecordingBarbershopRepository extends InMemoryBarbershopRepository {
  readonly saved: SavedSettings[] = [];

  override saveSettings(barbershop: Barbershop): Promise<void> {
    this.saved.push(describeSettings(barbershop));
    return super.saveSettings(barbershop);
  }
}

const WEEK: Record<Weekday, DayOpeningHoursInput | null> = {
  monday: {
    opensAt: '09:00',
    closesAt: '19:00',
    break: { startsAt: '12:00', endsAt: '13:00' },
  },
  tuesday: { opensAt: '09:00', closesAt: '19:00', break: null },
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

function validInput(
  overrides: Partial<UpdateBarbershopSettingsInput> = {},
): UpdateBarbershopSettingsInput {
  return {
    barbershopId: 'barbershop-a',
    name: 'Barbearia do Zé',
    address: 'Rua das Flores, 123 - Centro, Campinas/SP',
    timezone: 'America/Sao_Paulo',
    openingHours: WEEK,
    ...overrides,
  };
}

function setup() {
  const store = new InMemoryAccountStore();
  const a = Barbershop.startTrial({
    id: 'barbershop-a',
    name: 'Barbearia A',
    now: NOW,
  });
  store.barbershops.push(a);
  const repository = new RecordingBarbershopRepository(store);
  const useCase = new UpdateBarbershopSettingsUseCase(repository);
  return { a, repository, useCase };
}

describe('UpdateBarbershopSettingsUseCase', () => {
  it('CA-03.1: saves name, address, timezone and week, and returns the saved state', async () => {
    const { repository, useCase } = setup();

    const result = await useCase.execute(validInput());

    const expected: SavedSettings = {
      id: 'barbershop-a',
      name: 'Barbearia do Zé',
      address: 'Rua das Flores, 123 - Centro, Campinas/SP',
      timezone: 'America/Sao_Paulo',
      openingHours: WEEK,
    };
    expect(repository.saved).toEqual([expected]);
    expect(describeSettings(result)).toEqual(expected);
    const stored = await repository.findById('barbershop-a');
    expect(describeSettings(stored as Barbershop)).toEqual(expected);
  });

  it.each([
    [
      'closing before opening',
      { opensAt: '18:00', closesAt: '09:00', break: null },
      'Segunda-feira: o horário de fechamento deve ser depois do de abertura.',
    ],
    [
      'a break outside the opening hours',
      {
        opensAt: '09:00',
        closesAt: '19:00',
        break: { startsAt: '08:00', endsAt: '10:00' },
      },
      'Segunda-feira: o intervalo deve começar e terminar dentro do horário de funcionamento, com o fim depois do início.',
    ],
  ])(
    'CA-03.2: %s throws InvalidOpeningHoursError and nothing is saved',
    async (_case, monday, message) => {
      const { a, repository, useCase } = setup();
      const before = describeSettings(a);

      const attempt = useCase.execute(
        validInput({
          name: 'Nome Novo',
          timezone: 'America/Manaus',
          openingHours: { ...WEEK, monday },
        }),
      );

      await expect(attempt).rejects.toBeInstanceOf(InvalidOpeningHoursError);
      await expect(attempt).rejects.toThrow(message);
      expect(repository.saved).toEqual([]);
      const stored = await repository.findById('barbershop-a');
      expect(describeSettings(stored as Barbershop)).toEqual(before);
    },
  );

  it('CA-03.3: saves another Brazilian timezone', async () => {
    const { repository, useCase } = setup();

    await useCase.execute(validInput({ timezone: 'America/Manaus' }));

    expect(repository.saved.map((saved) => saved.timezone)).toEqual([
      'America/Manaus',
    ]);
    expect((await repository.findById('barbershop-a'))?.timezone).toBe(
      'America/Manaus',
    );
  });
});
