import { z } from 'zod';
import { Email } from '../../../domain/value-objects/email';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { passwordField } from './password.field';

const BARBERSHOP_NAME_MESSAGE =
  'Informe o nome da barbearia, com 2 a 100 caracteres.';
const OWNER_NAME_MESSAGE = 'Informe o seu nome, com 2 a 100 caracteres.';
const EMAIL_MESSAGE = 'Informe um e-mail válido.';
const PHONE_MESSAGE = 'Informe um telefone brasileiro válido, com DDD.';

function nameField(message: string) {
  return z.string({ error: message }).trim().min(2, message).max(100, message);
}

export const signupSchema = z.object({
  barbershopName: nameField(BARBERSHOP_NAME_MESSAGE).meta({
    example: 'Barbearia do José',
  }),
  ownerName: nameField(OWNER_NAME_MESSAGE).meta({ example: 'José da Silva' }),
  email: z
    .string({ error: EMAIL_MESSAGE })
    .refine((value) => Email.isValid(value), EMAIL_MESSAGE)
    .meta({ format: 'email', example: 'dono@barbearia.com' }),
  phone: z
    .string({ error: PHONE_MESSAGE })
    .refine((value) => PhoneNumber.isValid(value), PHONE_MESSAGE)
    .meta({
      description: 'Telefone brasileiro com DDD; aceita máscara e +55.',
      example: '(11) 91234-5678',
    }),
  password: passwordField,
});

export type SignupBody = z.infer<typeof signupSchema>;
