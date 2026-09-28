import { z } from 'zod';
import { UserInvitation } from '../../domain/entities/user-invitation';

export const invitationResponseSchema = z.object({
  id: z.uuid(),
  email: z.string().meta({ example: 'barbeiro@barbearia.com' }),
  name: z.string().meta({ example: 'Carlos Silva' }),
  expiresAt: z.iso.datetime().meta({
    description: 'Fim da validade do convite, em UTC (ISO 8601).',
  }),
});

export type InvitationResponse = z.infer<typeof invitationResponseSchema>;

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
