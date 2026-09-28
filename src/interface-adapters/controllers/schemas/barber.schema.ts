import { z } from 'zod';
import { timeOfDayField } from './time-of-day.field';

const MAX_SERVICES = 50;

const NAME_MESSAGE = 'Informe o nome do barbeiro, com 2 a 60 caracteres.';
const USER_ID_MESSAGE = 'Informe um id de usuário válido, ou null.';
const SERVICES_MESSAGE = 'Escolha de 1 a 50 serviços realizados, sem repetir.';
const SERVICE_ID_MESSAGE = 'Informe um id de serviço válido.';
const DAY_MESSAGE = 'Informe a jornada do dia, ou null se for folga.';
const BREAK_MESSAGE = 'Informe o início e o fim do intervalo.';

const breakSchema = z
  .object(
    { startsAt: timeOfDayField, endsAt: timeOfDayField },
    { error: BREAK_MESSAGE },
  )
  .meta({ description: 'Intervalo do dia; omita ou envie null se não há.' });

const daySchema = z
  .object(
    {
      startsAt: timeOfDayField,
      endsAt: timeOfDayField,
      break: breakSchema.nullish().transform((value) => value ?? null),
    },
    { error: DAY_MESSAGE },
  )
  .nullable()
  .meta({ description: 'Jornada do dia; null quando é folga.' });

export const barberSchema = z.object({
  name: z
    .string({ error: NAME_MESSAGE })
    .trim()
    .min(2, NAME_MESSAGE)
    .max(60, NAME_MESSAGE)
    .meta({ example: 'João' }),
  userId: z
    .uuid({ error: USER_ID_MESSAGE })
    .nullish()
    .transform((value) => value ?? null)
    .meta({
      description:
        'Usuário do painel (Dono ou Barbeiro) vinculado ao barbeiro; null ou omitido para não vincular.',
    }),
  serviceIds: z
    .array(z.uuid({ error: SERVICE_ID_MESSAGE }), { error: SERVICES_MESSAGE })
    .min(1, SERVICES_MESSAGE)
    .max(MAX_SERVICES, SERVICES_MESSAGE)
    .refine((ids) => new Set(ids).size === ids.length, SERVICES_MESSAGE)
    .meta({
      description:
        'Serviços ativos da mesma barbearia que o barbeiro realiza; substitui a lista inteira.',
    }),
  workingHours: z.object({
    monday: daySchema,
    tuesday: daySchema,
    wednesday: daySchema,
    thursday: daySchema,
    friday: daySchema,
    saturday: daySchema,
    sunday: daySchema,
  }),
});

export type BarberBody = z.infer<typeof barberSchema>;
