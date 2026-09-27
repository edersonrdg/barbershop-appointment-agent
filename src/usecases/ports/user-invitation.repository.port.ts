import { User } from '../../domain/entities/user';
import { UserInvitation } from '../../domain/entities/user-invitation';

export const USER_INVITATION_REPOSITORY = Symbol('UserInvitationRepository');

export interface AcceptInvitationInput {
  invitation: UserInvitation;
  user: User;
  acceptedAt: Date;
}

export interface UserInvitationRepository {
  // Inviting the same e-mail again invalidates the previous invitation: the
  // pending ones for that e-mail in the barbershop are deleted first.
  replacePending(invitation: UserInvitation): Promise<void>;
  // RN-26 exception (AD-004): the invitation is accepted without a session,
  // so the tenant comes from the invitation found by its hash.
  findByTokenHash(tokenHash: string): Promise<UserInvitation | null>;
  // Marks the invitation as accepted only if it is still pending and creates
  // the user in the same transaction; returns false when another request won
  // the race and throws EmailAlreadyRegisteredError when the e-mail is taken.
  accept(input: AcceptInvitationInput): Promise<boolean>;
}
