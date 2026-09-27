import { UserInvitation } from '../../domain/entities/user-invitation';

export interface InvitationResponse {
  id: string;
  email: string;
  name: string;
  expiresAt: string;
}

export class InvitationPresenter {
  static toResponse(invitation: UserInvitation): InvitationResponse {
    return {
      id: invitation.id,
      email: invitation.email,
      name: invitation.name,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }
}
