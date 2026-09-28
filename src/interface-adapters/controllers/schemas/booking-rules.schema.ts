import { z } from 'zod';
import {
  DEADLINE_STEP_MINUTES,
  isValidDeadlineMinutes,
  isValidNoShowLimit,
  isValidReturnReminderDays,
  isValidWaitlistOfferMinutes,
  MAX_DEADLINE_MINUTES,
  MAX_NO_SHOW_LIMIT,
  MAX_RETURN_REMINDER_DAYS,
  MAX_WAITLIST_OFFER_MINUTES,
  MIN_NO_SHOW_LIMIT,
  MIN_RETURN_REMINDER_DAYS,
  MIN_WAITLIST_OFFER_MINUTES,
} from '../../../domain/value-objects/booking-rules';

const MINIMUM_ADVANCE_MESSAGE =
  'Informe a antecedência mínima em minutos, de 0 a 10080, em múltiplos de 5.';
const CANCELLATION_DEADLINE_MESSAGE =
  'Informe o prazo de cancelamento em minutos, de 0 a 10080, em múltiplos de 5.';
const NO_SHOW_LIMIT_MESSAGE = 'Informe o limite de faltas, de 1 a 10.';
const WAITLIST_OFFER_MESSAGE =
  'Informe o prazo da oferta da lista de espera em minutos, de 5 a 120.';
const RETURN_REMINDER_MESSAGE =
  'Informe os dias para o lembrete de retorno, de 7 a 365.';

function ruleField(
  message: string,
  isValid: (value: number) => boolean,
  meta: Record<string, unknown>,
) {
  return z
    .number({ error: message })
    .refine((value) => isValid(value), message)
    .meta(meta);
}

export const bookingRulesSchema = z.object({
  minimumAdvanceMinutes: ruleField(
    MINIMUM_ADVANCE_MESSAGE,
    isValidDeadlineMinutes,
    {
      description:
        'Antecedência mínima, em minutos, para o bot oferecer um horário (RN-02). 0 = sem restrição.',
      minimum: 0,
      maximum: MAX_DEADLINE_MINUTES,
      multipleOf: DEADLINE_STEP_MINUTES,
      example: 60,
    },
  ),
  cancellationDeadlineMinutes: ruleField(
    CANCELLATION_DEADLINE_MESSAGE,
    isValidDeadlineMinutes,
    {
      description:
        'Até quantos minutos antes do horário o bot aceita cancelar ou remarcar (RN-09). 0 = até o horário.',
      minimum: 0,
      maximum: MAX_DEADLINE_MINUTES,
      multipleOf: DEADLINE_STEP_MINUTES,
      example: 120,
    },
  ),
  noShowLimit: ruleField(NO_SHOW_LIMIT_MESSAGE, isValidNoShowLimit, {
    description:
      'Faltas a partir das quais o bot deixa de agendar o cliente (RN-12).',
    minimum: MIN_NO_SHOW_LIMIT,
    maximum: MAX_NO_SHOW_LIMIT,
    example: 2,
  }),
  waitlistOfferMinutes: ruleField(
    WAITLIST_OFFER_MESSAGE,
    isValidWaitlistOfferMinutes,
    {
      description:
        'Minutos que o cliente da lista de espera tem para aceitar a vaga (RN-16).',
      minimum: MIN_WAITLIST_OFFER_MINUTES,
      maximum: MAX_WAITLIST_OFFER_MINUTES,
      example: 15,
    },
  ),
  returnReminderDays: ruleField(
    RETURN_REMINDER_MESSAGE,
    isValidReturnReminderDays,
    {
      description:
        'Dias desde o último atendimento para enviar o lembrete de retorno (RN-19).',
      minimum: MIN_RETURN_REMINDER_DAYS,
      maximum: MAX_RETURN_REMINDER_DAYS,
      example: 30,
    },
  ),
});

export type BookingRulesBody = z.infer<typeof bookingRulesSchema>;
