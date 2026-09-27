import { PasswordResetToken } from '../../domain/entities/password-reset-token';
import { User } from '../../domain/entities/user';
import { FakeEmailSender } from '../testing/fake-email-sender';
import { FakeResetTokenGenerator } from '../testing/fake-reset-token-generator';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryPasswordResetRepository } from '../testing/in-memory-password-reset.repository';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository';
import { SequentialIdGenerator } from '../testing/sequential-id-generator';
import { RequestPasswordResetUseCase } from './request-password-reset.use-case';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const ONE_HOUR_MS = 60 * 60 * 1000;
const APP_WEB_URL = 'https://painel.exemplo.com.br';

function setup() {
  const store = new InMemoryAccountStore();
  store.users.push(
    User.createOwner({
      id: 'user-a',
      barbershopId: 'barbershop-a',
      name: 'José',
      email: 'dono@barbearia.com',
      phone: '+5511912345678',
      passwordHash: 'hashed(senha-antiga)',
      now: NOW,
    }),
  );
  const emailSender = new FakeEmailSender();
  const useCase = new RequestPasswordResetUseCase(
    new InMemoryUserRepository(store),
    new InMemoryPasswordResetRepository(store),
    new FakeResetTokenGenerator(),
    emailSender,
    new FixedClock(NOW),
    new SequentialIdGenerator(),
    APP_WEB_URL,
  );
  return { store, emailSender, useCase };
}

describe('RequestPasswordResetUseCase', () => {
  it('CA-01.5: sends one pt-BR e-mail to the normalized address with the exact link carrying the generated token', async () => {
    const { emailSender, useCase } = setup();

    await useCase.execute({ email: '  DONO@Barbearia.com ' });

    expect(emailSender.sent).toHaveLength(1);
    const [message] = emailSender.sent;
    expect(message.to).toBe('dono@barbearia.com');
    expect(message.subject).toBe('Redefinição de senha');
    expect(message.text).toContain(
      'https://painel.exemplo.com.br/redefinir-senha?token=reset-token-1',
    );
    expect(message.text).toContain(
      'Recebemos um pedido para redefinir a senha',
    );
  });

  it('CA-01.5: stores the token only as a hash, valid for 1 h, and removes the previous token of the user', async () => {
    const { store, useCase } = setup();
    await useCase.execute({ email: 'dono@barbearia.com' });
    const [first] = store.passwordResetTokens;

    await useCase.execute({ email: 'dono@barbearia.com' });

    expect(store.passwordResetTokens).toHaveLength(1);
    const [stored] = store.passwordResetTokens;
    expect(stored).not.toBe(first);
    expect(store.passwordResetTokens).not.toContain(first);
    expect(stored.tokenHash).toBe('sha256(reset-token-2)');
    expect(stored.tokenHash).not.toBe('reset-token-2');
    expect(stored.userId).toBe('user-a');
    expect(stored.barbershopId).toBe('barbershop-a');
    expect(stored.usedAt).toBeNull();
    expect(stored.expiresAt.getTime()).toBe(NOW.getTime() + ONE_HOUR_MS);
  });

  it('CA-01.5: resolves without error and sends no e-mail when the e-mail does not exist', async () => {
    const { store, emailSender, useCase } = setup();

    await expect(
      useCase.execute({ email: 'ninguem@barbearia.com' }),
    ).resolves.toBeUndefined();

    expect(emailSender.sent).toEqual([]);
    expect(store.passwordResetTokens).toEqual([]);
  });

  it('CA-01.5: resolves without error when the e-mail sender throws', async () => {
    const { store, emailSender, useCase } = setup();
    emailSender.failure = new Error('SMTP down');

    await expect(
      useCase.execute({ email: 'dono@barbearia.com' }),
    ).resolves.toBeUndefined();

    expect(store.passwordResetTokens).toHaveLength(1);
    expect(store.passwordResetTokens[0]).toBeInstanceOf(PasswordResetToken);
  });
});
