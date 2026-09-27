import { Barbershop } from '../../domain/entities/barbershop';
import { User } from '../../domain/entities/user';
import { EmailAlreadyRegisteredError } from '../../domain/errors/email-already-registered.error';
import { InvitationDeliveryFailedError } from '../../domain/errors/invitation-delivery-failed.error';
import { FakeEmailSender } from '../testing/fake-email-sender';
import { FakeResetTokenGenerator } from '../testing/fake-reset-token-generator';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryUserInvitationRepository } from '../testing/in-memory-user-invitation.repository';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository';
import { SequentialIdGenerator } from '../testing/sequential-id-generator';
import { InviteBarberUseCase } from './invite-barber.use-case';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const APP_WEB_URL = 'https://painel.exemplo.com';

function setup() {
  const store = new InMemoryAccountStore();
  const barbershop = Barbershop.startTrial({
    id: 'barbershop-a',
    name: 'Barbearia do Zé',
    now: NOW,
  });
  store.barbershops.push(barbershop);
  store.users.push(
    User.createOwner({
      id: 'owner-a',
      barbershopId: barbershop.id,
      name: 'José',
      email: 'dono@barbearia.com',
      phone: '+5511912345678',
      passwordHash: 'hash',
      now: NOW,
    }),
  );
  const emailSender = new FakeEmailSender();
  const useCase = new InviteBarberUseCase(
    new InMemoryUserRepository(store),
    new InMemoryBarbershopRepository(store),
    new InMemoryUserInvitationRepository(store),
    new FakeResetTokenGenerator(),
    emailSender,
    new FixedClock(NOW),
    new SequentialIdGenerator(),
    APP_WEB_URL,
  );
  return { store, useCase, emailSender };
}

describe('InviteBarberUseCase', () => {
  it('CA-02.1: stores the invitation with the normalized e-mail and sends the link', async () => {
    const { store, useCase, emailSender } = setup();

    const invitation = await useCase.execute({
      barbershopId: 'barbershop-a',
      email: ' Joao@Exemplo.com ',
      name: 'João Pereira',
    });

    expect(invitation.email).toBe('joao@exemplo.com');
    expect(store.userInvitations).toEqual([invitation]);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('joao@exemplo.com');
    expect(emailSender.sent[0].text).toContain(
      `${APP_WEB_URL}/aceitar-convite?token=reset-token-1`,
    );
    expect(emailSender.sent[0].text).toContain('Barbearia do Zé');
  });

  it('CA-02.1: rejects an e-mail that already belongs to a user', async () => {
    const { store, useCase, emailSender } = setup();

    await expect(
      useCase.execute({
        barbershopId: 'barbershop-a',
        email: 'dono@barbearia.com',
        name: 'José',
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(store.userInvitations).toHaveLength(0);
    expect(emailSender.sent).toHaveLength(0);
  });

  it('CA-02.1: replaces the pending invitation of the same e-mail', async () => {
    const { store, useCase } = setup();
    const input = {
      barbershopId: 'barbershop-a',
      email: 'joao@exemplo.com',
      name: 'João Pereira',
    };

    await useCase.execute(input);
    const second = await useCase.execute(input);

    expect(store.userInvitations).toEqual([second]);
  });

  it('CA-02.1: keeps the invitation and reports the failure when the e-mail cannot be sent', async () => {
    const { store, useCase, emailSender } = setup();
    emailSender.failure = new Error('smtp down');

    await expect(
      useCase.execute({
        barbershopId: 'barbershop-a',
        email: 'joao@exemplo.com',
        name: 'João Pereira',
      }),
    ).rejects.toBeInstanceOf(InvitationDeliveryFailedError);
    expect(store.userInvitations).toHaveLength(1);
  });
});
