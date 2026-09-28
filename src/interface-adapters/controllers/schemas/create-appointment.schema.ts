import { z } from 'zod';
import { CLIENT_NAME_MESSAGE } from '../../../domain/entities/client';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { serviceIdsField } from './service-ids.field';

const MS_PER_MINUTE = 60 * 1000;
const BARBER_MESSAGE = 'Informe um id de barbeiro válido.';
const STARTS_AT_MESSAGE =
  'Informe o início em ISO 8601 com fuso, em minuto cheio.';
const PHONE_MESSAGE = 'Informe um telefone brasileiro válido, com DDD.';
const CLIENT_MESSAGE = 'Informe o nome e o telefone do cliente.';

export const createAppointmentSchema = z.object({
  barberId: z.uuid({ error: BARBER_MESSAGE }).meta({
    description:
      'Barbeiro do agendamento. O Barbeiro só pode informar o próprio id.',
  }),
  serviceIds: serviceIdsField,
  startsAt: z.iso
    .datetime({ offset: true, abort: true, error: STARTS_AT_MESSAGE })
    .refine(
      (value) => new Date(value).getTime() % MS_PER_MINUTE === 0,
      STARTS_AT_MESSAGE,
    )
    .transform((value) => new Date(value))
    .meta({
      description:
        'Início em ISO 8601 com fuso (Z ou ±HH:mm), em minuto cheio. Use um início devolvido por GET /appointments/available-slots.',
      example: '2026-10-01T13:00:00.000Z',
    }),
  client: z
    .object(
      {
        name: z
          .string({ error: CLIENT_NAME_MESSAGE })
          .trim()
          .min(2, CLIENT_NAME_MESSAGE)
          .max(80, CLIENT_NAME_MESSAGE)
          .meta({
            description:
              'Nome do cliente, de 2 a 80 caracteres. Ignorado quando o telefone já é de um cliente da barbearia.',
            example: 'João',
          }),
        phone: z
          .string({ error: PHONE_MESSAGE })
          .refine((value) => PhoneNumber.isValid(value), PHONE_MESSAGE)
          .meta({
            description:
              'Telefone brasileiro com DDD; identifica o cliente na barbearia.',
            example: '(11) 98765-4321',
          }),
      },
      { error: CLIENT_MESSAGE },
    )
    .meta({
      description:
        'Cliente do agendamento. Um telefone novo cria o cliente; um já cadastrado liga ao cliente existente.',
    }),
});

export type CreateAppointmentBody = z.infer<typeof createAppointmentSchema>;
