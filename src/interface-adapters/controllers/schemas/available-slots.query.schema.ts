import { z } from 'zod';
import { DATE_MESSAGE, isCalendarDate } from './schedule.query.schema';
import { serviceIdsQueryField } from './service-ids.field';

export const availableSlotsQuerySchema = z.object({
  date: z
    .string({ error: DATE_MESSAGE })
    .refine(isCalendarDate, DATE_MESSAGE)
    .meta({
      description: 'Data local da barbearia (AAAA-MM-DD).',
      format: 'date',
      example: '2026-10-01',
    }),
  serviceIds: serviceIdsQueryField,
  barberId: z
    .uuid({ error: 'Informe um id de barbeiro válido.' })
    .optional()
    .meta({
      description:
        'Barbeiro consultado. Sem ele, o Dono vê qualquer barbeiro apto e o Barbeiro, a própria agenda. O Barbeiro só pode informar o próprio id.',
    }),
});

export type AvailableSlotsQueryParams = z.infer<
  typeof availableSlotsQuerySchema
>;
