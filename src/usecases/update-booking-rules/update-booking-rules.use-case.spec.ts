import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { InvalidValueError } from '../../domain/errors/invalid-value.error';
import {
  BookingRules,
  BookingRulesProps,
} from '../../domain/value-objects/booking-rules';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBookingRulesRepository } from '../testing/in-memory-booking-rules.repository';
import { UpdateBookingRulesUseCase } from './update-booking-rules.use-case';

const DEFAULTS: BookingRulesProps = {
  minimumAdvanceMinutes: 60,
  cancellationDeadlineMinutes: 120,
  noShowLimit: 2,
  waitlistOfferMinutes: 15,
  returnReminderDays: 30,
};

const NEW_RULES: BookingRulesProps = {
  minimumAdvanceMinutes: 30,
  cancellationDeadlineMinutes: 240,
  noShowLimit: 3,
  waitlistOfferMinutes: 20,
  returnReminderDays: 45,
};

function toPlain(rules: BookingRules | null): BookingRulesProps | null {
  if (!rules) return null;
  return {
    minimumAdvanceMinutes: rules.minimumAdvanceMinutes,
    cancellationDeadlineMinutes: rules.cancellationDeadlineMinutes,
    noShowLimit: rules.noShowLimit,
    waitlistOfferMinutes: rules.waitlistOfferMinutes,
    returnReminderDays: rules.returnReminderDays,
  };
}

function setup() {
  const store = new InMemoryAccountStore();
  store.bookingRules.set('barbershop-a', BookingRules.defaults());
  store.bookingRules.set('barbershop-b', BookingRules.defaults());
  const repository = new InMemoryBookingRulesRepository(store);
  const useCase = new UpdateBookingRulesUseCase(repository);
  return { repository, useCase };
}

describe('UpdateBookingRulesUseCase', () => {
  it('CA-06.2: saves the five rules and returns them', async () => {
    const { useCase } = setup();

    const saved = await useCase.execute({
      barbershopId: 'barbershop-a',
      ...NEW_RULES,
    });

    expect(toPlain(saved)).toEqual(NEW_RULES);
  });

  it('CA-06.2: the next repository read returns the new rules for the same barbershop', async () => {
    const { repository, useCase } = setup();

    await useCase.execute({ barbershopId: 'barbershop-a', ...NEW_RULES });

    expect(
      toPlain(await repository.findByBarbershopId('barbershop-a')),
    ).toEqual(NEW_RULES);
  });

  it('RN-26: changes only the barbershop of the session', async () => {
    const { repository, useCase } = setup();

    await useCase.execute({ barbershopId: 'barbershop-a', ...NEW_RULES });

    expect(
      toPlain(await repository.findByBarbershopId('barbershop-b')),
    ).toEqual(DEFAULTS);
  });

  it('CA-06.2: accepts 0 for minimum advance and cancellation deadline', async () => {
    const { repository, useCase } = setup();
    const zeros = {
      ...NEW_RULES,
      minimumAdvanceMinutes: 0,
      cancellationDeadlineMinutes: 0,
    };

    await useCase.execute({ barbershopId: 'barbershop-a', ...zeros });

    expect(
      toPlain(await repository.findByBarbershopId('barbershop-a')),
    ).toEqual(zeros);
  });

  it.each<[keyof BookingRulesProps, number]>([
    ['minimumAdvanceMinutes', -5],
    ['noShowLimit', 0],
    ['returnReminderDays', 366],
  ])(
    'CA-06.3: %s = %p throws InvalidValueError and saves nothing',
    async (field, value) => {
      const { repository, useCase } = setup();

      await expect(
        useCase.execute({
          barbershopId: 'barbershop-a',
          ...NEW_RULES,
          [field]: value,
        }),
      ).rejects.toBeInstanceOf(InvalidValueError);

      expect(
        toPlain(await repository.findByBarbershopId('barbershop-a')),
      ).toEqual(DEFAULTS);
    },
  );

  it('a barbershop without rules throws InvalidCredentialsError', async () => {
    const { useCase } = setup();

    await expect(
      useCase.execute({ barbershopId: 'barbershop-x', ...NEW_RULES }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
