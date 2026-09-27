import { UserInvitation } from '../../domain/entities/user-invitation';
import { EmailAlreadyRegisteredError } from '../../domain/errors/email-already-registered.error';
import {
  AcceptInvitationInput,
  UserInvitationRepository,
} from '../ports/user-invitation.repository.port';
import { InMemoryAccountStore } from './in-memory-account-store';

export class InMemoryUserInvitationRepository implements UserInvitationRepository {
  constructor(private readonly store: InMemoryAccountStore) {}

  replacePending(invitation: UserInvitation): Promise<void> {
    this.store.userInvitations = this.store.userInvitations.filter(
      (existing) =>
        existing.barbershopId !== invitation.barbershopId ||
        existing.email !== invitation.email ||
        existing.acceptedAt !== null,
    );
    this.store.userInvitations.push(invitation);
    return Promise.resolve();
  }

  findByTokenHash(tokenHash: string): Promise<UserInvitation | null> {
    const found = this.store.userInvitations.find(
      (invitation) => invitation.tokenHash === tokenHash,
    );
    return Promise.resolve(found ?? null);
  }

  accept({
    invitation,
    user,
    acceptedAt,
  }: AcceptInvitationInput): Promise<boolean> {
    const index = this.store.userInvitations.findIndex(
      (existing) =>
        existing.id === invitation.id && existing.acceptedAt === null,
    );
    if (index === -1) {
      return Promise.resolve(false);
    }
    if (this.store.users.some((existing) => existing.email === user.email)) {
      return Promise.reject(new EmailAlreadyRegisteredError());
    }

    const pending = this.store.userInvitations[index];
    this.store.userInvitations[index] = UserInvitation.restore({
      id: pending.id,
      barbershopId: pending.barbershopId,
      email: pending.email,
      name: pending.name,
      tokenHash: pending.tokenHash,
      expiresAt: pending.expiresAt,
      acceptedAt,
      createdAt: pending.createdAt,
    });
    this.store.users.push(user);
    return Promise.resolve(true);
  }
}
