import { z } from 'zod';
import { DATE_MESSAGE, isCalendarDate } from './schedule.query.schema';

export const REPORT_MAX_DAYS = 92;
const ORDER_MESSAGE =
  'A data final deve ser igual ou posterior à data inicial.';
const MAX_DAYS_MESSAGE = `O período pode ter no máximo ${REPORT_MAX_DAYS} dias.`;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const localDate = (description: string, example: string) =>
  z
    .string({ error: DATE_MESSAGE })
    .refine(isCalendarDate, DATE_MESSAGE)
    .meta({ description, format: 'date', example });

export const reportQuerySchema = z
  .object({
    from: localDate(
      'Primeiro dia do período, data local da barbearia (AAAA-MM-DD).',
      '2026-10-01',
    ),
    to: localDate(
      `Último dia do período, incluído (AAAA-MM-DD). No máximo ${REPORT_MAX_DAYS} dias contando from e to.`,
      '2026-10-31',
    ),
    barberId: z
      .uuid({ error: 'Informe um id de barbeiro válido.' })
      .optional()
      .meta({ description: 'Filtra todos os números por um barbeiro.' }),
  })
  // An invalid date already has its own message, so the period is only
  // checked between two valid dates.
  .superRefine((query, context) => {
    if (!isCalendarDate(query.from) || !isCalendarDate(query.to)) return;
    const days = (Date.parse(query.to) - Date.parse(query.from)) / MS_PER_DAY;
    if (days < 0) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: ORDER_MESSAGE,
      });
      return;
    }
    if (days + 1 > REPORT_MAX_DAYS) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: MAX_DAYS_MESSAGE,
      });
    }
  });

export type ReportQueryParams = z.infer<typeof reportQuerySchema>;
