import { z } from 'zod';
import { IssuedAccessToken } from '../../usecases/ports/access-token-issuer.port';

export const sessionResponseSchema = z.object({
  accessToken: z.string().meta({
    description: 'JWT da sessão. Envie em `Authorization: Bearer <token>`.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  }),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().meta({
    description: 'Validade do token, em segundos.',
    example: 604800,
  }),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export class SessionPresenter {
  static toResponse(session: IssuedAccessToken): SessionResponse {
    return {
      accessToken: session.accessToken,
      tokenType: 'Bearer',
      expiresIn: session.expiresIn,
    };
  }
}
