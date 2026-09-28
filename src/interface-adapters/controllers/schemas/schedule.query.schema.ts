import { z } from 'zod';

const VIEW_MESSAGE = 'Escolha a visão: day ou week.';
const DATE_MESSAGE = 'Informe uma data válida no formato AAAA-MM-DD.';
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const scheduleQuerySchema = z.object({
  view: z.enum(['day', 'week'], { error: VIEW_MESSAGE }).meta({
    description:
      'day: o dia da data. week: de segunda a domingo da semana da data.',
    example: 'day',
  }),
  date: z
    .string({ error: DATE_MESSAGE })
    .refine(isCalendarDate, DATE_MESSAGE)
    .meta({
      description: 'Data local da barbearia (AAAA-MM-DD).',
      format: 'date',
      example: '2026-09-28',
    }),
  barberId: z
    .uuid({ error: 'Informe um id de barbeiro válido.' })
    .optional()
    .meta({
      description:
        'Filtra por um barbeiro. O Barbeiro só pode informar o próprio id.',
    }),
});

export type ScheduleQueryParams = z.infer<typeof scheduleQuerySchema>;

// Date.UTC rolls 2026-02-30 over to March, so a date that changes on the round
// trip does not exist in the calendar.
function isCalendarDate(value: string): boolean {
  if (!LOCAL_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
