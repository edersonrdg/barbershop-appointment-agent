import { z } from 'zod';
import {
  BLOCK_REASON_MAX_LENGTH,
  BLOCK_REASON_TOO_LONG_MESSAGE,
} from '../../../domain/entities/barber-block';
import { TimeOfDay } from '../../../domain/value-objects/time-of-day';
import { BLOCK_END_BEFORE_START_MESSAGE } from '../../../domain/value-objects/block-period';
import { DATE_MESSAGE, isCalendarDate } from './schedule.query.schema';

const KIND_MESSAGE = 'Escolha o tipo: block ou day_off.';
const BARBER_MESSAGE = 'Informe um id de barbeiro válido.';
const TIME_MESSAGE = 'Informe um horário válido no formato HH:mm.';
const CONFIRM_MESSAGE = 'Informe true ou false em confirmConflicts.';
// 24:00 closes a block at the end of the local day; it is never a start.
const END_OF_DAY = '24:00';

const isStart = (value: string) => TimeOfDay.isValid(value);
const isEnd = (value: string) =>
  value === END_OF_DAY || TimeOfDay.isValid(value);

const commonFields = {
  barberId: z.uuid({ error: BARBER_MESSAGE }).meta({
    description:
      'Barbeiro bloqueado. O Barbeiro só pode informar o próprio id.',
  }),
  date: z
    .string({ error: DATE_MESSAGE })
    .refine(isCalendarDate, DATE_MESSAGE)
    .meta({
      description: 'Data local da barbearia (AAAA-MM-DD).',
      format: 'date',
      example: '2026-10-01',
    }),
  reason: z
    .string({ error: BLOCK_REASON_TOO_LONG_MESSAGE })
    .trim()
    .max(BLOCK_REASON_MAX_LENGTH, BLOCK_REASON_TOO_LONG_MESSAGE)
    .optional()
    .meta({
      description: 'Motivo opcional, até 120 caracteres; vazio vira null.',
      example: 'Almoço',
    }),
  confirmConflicts: z.boolean({ error: CONFIRM_MESSAGE }).optional().meta({
    description:
      'true grava o bloqueio mesmo que ele atinja agendamentos confirmados, que não são cancelados. Sem true, o conflito responde 409 com a lista.',
    example: false,
  }),
};

const blockSchema = z
  .object({
    kind: z.literal('block').meta({ description: 'Bloqueio de horário.' }),
    ...commonFields,
    start: z
      .string({ error: TIME_MESSAGE })
      .refine(isStart, TIME_MESSAGE)
      .meta({ description: 'Início local (HH:mm).', example: '12:00' }),
    end: z.string({ error: TIME_MESSAGE }).refine(isEnd, TIME_MESSAGE).meta({
      description: 'Fim local (HH:mm); 24:00 vai até o fim do dia.',
      example: '13:00',
    }),
  })
  // Zero-padded HH:mm compares as text; an invalid time already has its own
  // message, so the order is only checked between two valid times.
  .refine(
    (block) =>
      !isStart(block.start) || !isEnd(block.end) || block.end > block.start,
    {
      path: ['end'],
      message: BLOCK_END_BEFORE_START_MESSAGE,
    },
  );

const dayOffSchema = z.object({
  kind: z.literal('day_off').meta({
    description: 'Folga do dia inteiro; start e end são ignorados.',
  }),
  ...commonFields,
});

export const createBarberBlockSchema = z.discriminatedUnion(
  'kind',
  [blockSchema, dayOffSchema],
  { error: KIND_MESSAGE },
);

export type CreateBarberBlockBody = z.infer<typeof createBarberBlockSchema>;
