import { z } from 'zod';
import {
  BarbershopTimezone,
  BRAZILIAN_TIMEZONES,
} from '../../../domain/value-objects/barbershop-timezone';
import { TimeOfDay } from '../../../domain/value-objects/time-of-day';

const NAME_MESSAGE = 'Informe o nome da barbearia, com 2 a 100 caracteres.';
const ADDRESS_MESSAGE =
  'Informe o endereço da barbearia, com 5 a 200 caracteres.';
const TIMEZONE_MESSAGE = 'Escolha um fuso horário do Brasil.';
const TIME_MESSAGE = 'Informe o horário no formato HH:mm, entre 00:00 e 23:59.';
const DAY_MESSAGE =
  'Informe o horário do dia, ou null se a barbearia fica fechada.';
const BREAK_MESSAGE = 'Informe o início e o fim do intervalo.';

const timeField = z
  .string({ error: TIME_MESSAGE })
  .refine((value) => TimeOfDay.isValid(value), TIME_MESSAGE)
  .meta({ description: 'HH:mm', example: '09:00' });

const breakSchema = z
  .object({ startsAt: timeField, endsAt: timeField }, { error: BREAK_MESSAGE })
  .meta({ description: 'Intervalo do dia; omita ou envie null se não há.' });

const daySchema = z
  .object(
    {
      opensAt: timeField,
      closesAt: timeField,
      break: breakSchema.nullish().transform((value) => value ?? null),
    },
    { error: DAY_MESSAGE },
  )
  .nullable()
  .meta({ description: 'Horário do dia; null quando a barbearia fecha.' });

export const barbershopSettingsSchema = z.object({
  name: z
    .string({ error: NAME_MESSAGE })
    .trim()
    .min(2, NAME_MESSAGE)
    .max(100, NAME_MESSAGE)
    .meta({ example: 'Barbearia do Zé' }),
  address: z
    .string({ error: ADDRESS_MESSAGE })
    .trim()
    .min(5, ADDRESS_MESSAGE)
    .max(200, ADDRESS_MESSAGE)
    .meta({ example: 'Rua das Flores, 123' }),
  timezone: z
    .string({ error: TIMEZONE_MESSAGE })
    .refine((value) => BarbershopTimezone.isValid(value), TIMEZONE_MESSAGE)
    .meta({ enum: [...BRAZILIAN_TIMEZONES], example: 'America/Sao_Paulo' }),
  openingHours: z.object({
    monday: daySchema,
    tuesday: daySchema,
    wednesday: daySchema,
    thursday: daySchema,
    friday: daySchema,
    saturday: daySchema,
    sunday: daySchema,
  }),
});

export type BarbershopSettingsBody = z.infer<typeof barbershopSettingsSchema>;
