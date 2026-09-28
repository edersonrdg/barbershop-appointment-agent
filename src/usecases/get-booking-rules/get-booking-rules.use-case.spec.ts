import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBookingRulesRepository } from '../testing/in-memory-booking-rules.repository';
import { GetBookingRulesUseCase } from './get-booking-rules.use-case';

function setup() {
  const store = new InMemoryAccountStore();
  const rulesA = BookingRules.defaults();
  const rulesB = BookingRules.create({
    minimumAdvanceMinutes: 30,
    cancellationDeadlineMinutes: 240,
    noShowLimit: 3,
    waitlistOfferMinutes: 20,
    returnReminderDays: 45,
  });
  store.bookingRules.set('barbershop-a', rulesA);
  store.bookingRules.set('barbershop-b', rulesB);
  const useCase = new GetBookingRulesUseCase(
    new InMemoryBookingRulesRepository(store),
  );
  return { rulesA, rulesB, useCase };
}

describe('GetBookingRulesUseCase', () => {
  it('CA-06.1: returns the rules of the given tenant, never those of another one (RN-26)', async () => {
    const { rulesA, rulesB, useCase } = setup();

    const readA = await useCase.execute({ barbershopId: 'barbershop-a' });
    const readB = await useCase.execute({ barbershopId: 'barbershop-b' });

    expect(readA).toBe(rulesA);
    expect(readA.minimumAdvanceMinutes).toBe(60);
    expect(readB).toBe(rulesB);
    expect(readB.minimumAdvanceMinutes).toBe(30);
  });

  it('a barbershop without rules throws InvalidCredentialsError', async () => {
    const { useCase } = setup();

    await expect(
      useCase.execute({ barbershopId: 'barbershop-x' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
