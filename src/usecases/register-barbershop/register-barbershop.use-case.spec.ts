import { EmailAlreadyRegisteredError } from '../../domain/errors/email-already-registered.error';
import { CountingAccountMetrics } from '../testing/counting-account-metrics';
import {
  FAKE_TOKEN_TTL_SECONDS,
  FakeAccessTokenIssuer,
} from '../testing/fake-access-token-issuer';
import { FakePasswordHasher } from '../testing/fake-password-hasher';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryBookingRulesRepository } from '../testing/in-memory-booking-rules.repository';
import { SequentialIdGenerator } from '../testing/sequential-id-generator';
import {
  RegisterBarbershopInput,
  RegisterBarbershopUseCase,
} from './register-barbershop.use-case';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const validInput: RegisterBarbershopInput = {
  barbershopName: 'Barbearia do Zé',
  ownerName: 'José da Silva',
  email: 'dono@barbearia.com',
  phone: '+5511912345678',
  password: 'senha-secreta-123',
};

function setup() {
  const store = new InMemoryAccountStore();
  const tokenIssuer = new FakeAccessTokenIssuer();
  const metrics = new CountingAccountMetrics();
  const useCase = new RegisterBarbershopUseCase(
    new InMemoryBarbershopRepository(store),
    new FakePasswordHasher(),
    tokenIssuer,
    new FixedClock(NOW),
    new SequentialIdGenerator(),
    metrics,
  );
  return { store, tokenIssuer, metrics, useCase };
}

describe('RegisterBarbershopUseCase', () => {
  it('CA-06.1: the new barbershop gets 60 min advance, 120 min cancellation, 2 no-shows, 15 min offer and 30 days return', async () => {
    const { store, useCase } = setup();

    await useCase.execute(validInput);

    const [barbershop] = store.barbershops;
    const rules = await new InMemoryBookingRulesRepository(
      store,
    ).findByBarbershopId(barbershop.id);
    expect(rules).not.toBeNull();
    expect({
      minimumAdvanceMinutes: rules?.minimumAdvanceMinutes,
      cancellationDeadlineMinutes: rules?.cancellationDeadlineMinutes,
      noShowLimit: rules?.noShowLimit,
      waitlistOfferMinutes: rules?.waitlistOfferMinutes,
      returnReminderDays: rules?.returnReminderDays,
    }).toEqual({
      minimumAdvanceMinutes: 60,
      cancellationDeadlineMinutes: 120,
      noShowLimit: 2,
      waitlistOfferMinutes: 15,
      returnReminderDays: 30,
    });
  });

  it('CA-01.1: persists the barbershop and an owner linked to it, and issues a session for that user and tenant', async () => {
    const { store, tokenIssuer, useCase } = setup();

    const session = await useCase.execute(validInput);

    expect(store.barbershops).toHaveLength(1);
    expect(store.users).toHaveLength(1);
    const [barbershop] = store.barbershops;
    const [owner] = store.users;
    expect(barbershop.name).toBe('Barbearia do Zé');
    expect(owner.name).toBe('José da Silva');
    expect(owner.role).toBe('owner');
    expect(owner.barbershopId).toBe(barbershop.id);
    expect(owner.id).not.toBe(barbershop.id);
    expect(owner.createdAt).toEqual(NOW);
    expect(tokenIssuer.issued).toEqual([
      { userId: owner.id, barbershopId: barbershop.id, role: 'owner' },
    ]);
    expect(session).toEqual({
      accessToken: `token(${owner.id}|${barbershop.id}|owner)`,
      expiresIn: FAKE_TOKEN_TTL_SECONDS,
    });
  });

  it('CA-01.1: stores the hash returned by the hasher, never the plain password', async () => {
    const { store, useCase } = setup();

    await useCase.execute(validInput);

    const [owner] = store.users;
    expect(owner.passwordHash).toBe('hashed(senha-secreta-123)');
    expect(owner.passwordHash).not.toBe(validInput.password);
  });

  it('CA-01.2: persists the barbershop as trialing with the trial ending exactly 14 days after now', async () => {
    const { store, useCase } = setup();

    await useCase.execute(validInput);

    const [barbershop] = store.barbershops;
    expect(barbershop.subscriptionStatus).toBe('trialing');
    expect(barbershop.createdAt).toEqual(NOW);
    expect(barbershop.trialEndsAt.getTime() - NOW.getTime()).toBe(
      FOURTEEN_DAYS_MS,
    );
  });

  it('CA-01.3: rejects an e-mail already registered with different case and spaces, persisting nothing and issuing no token', async () => {
    const { store, tokenIssuer, metrics, useCase } = setup();
    await useCase.execute(validInput);
    tokenIssuer.issued.length = 0;

    await expect(
      useCase.execute({
        ...validInput,
        barbershopName: 'Outra Barbearia',
        email: '  DONO@Barbearia.COM ',
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);

    expect(store.barbershops).toHaveLength(1);
    expect(store.barbershops[0].name).toBe('Barbearia do Zé');
    expect(store.users).toHaveLength(1);
    expect(tokenIssuer.issued).toEqual([]);
    expect(metrics.signups).toBe(1);
  });

  it('stores the e-mail and the masked phone normalized', async () => {
    const { store, useCase } = setup();

    await useCase.execute({
      ...validInput,
      email: '  Dono@Barbearia.COM ',
      phone: '(11) 91234-5678',
    });

    const [owner] = store.users;
    expect(owner.email).toBe('dono@barbearia.com');
    expect(owner.phone).toBe('+5511912345678');
  });

  it('counts the signup only when it succeeds', async () => {
    const { metrics, useCase } = setup();

    await useCase.execute(validInput);
    expect(metrics.signups).toBe(1);

    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
    expect(metrics.signups).toBe(1);
  });
});
