import { z } from 'zod';
import { TimeOfDay } from '../../../domain/value-objects/time-of-day';

const TIME_MESSAGE = 'Informe o horário no formato HH:mm, entre 00:00 e 23:59.';

export const timeOfDayField = z
  .string({ error: TIME_MESSAGE })
  .refine((value) => TimeOfDay.isValid(value), TIME_MESSAGE)
  .meta({ description: 'HH:mm', example: '09:00' });
