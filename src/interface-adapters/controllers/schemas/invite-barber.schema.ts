import { z } from 'zod';
import { Email } from '../../../domain/value-objects/email';

const EMAIL_MESSAGE = 'Informe um e-mail válido.';
const NAME_MESSAGE = 'Informe o nome do barbeiro, com 2 a 100 caracteres.';

export const inviteBarberSchema = z.object({
  email: z
    .string({ error: EMAIL_MESSAGE })
    .refine((value) => Email.isValid(value), EMAIL_MESSAGE),
  name: z
    .string({ error: NAME_MESSAGE })
    .trim()
    .min(2, NAME_MESSAGE)
    .max(100, NAME_MESSAGE),
});

export type InviteBarberBody = z.infer<typeof inviteBarberSchema>;
