import { z } from 'zod';
import { passwordField } from './password.field';

export const acceptInvitationSchema = z.object({
  token: z
    .string({ error: 'Informe o token do convite.' })
    .min(1, 'Informe o token do convite.'),
  password: passwordField,
});

export type AcceptInvitationBody = z.infer<typeof acceptInvitationSchema>;
