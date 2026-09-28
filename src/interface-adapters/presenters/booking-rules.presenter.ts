import { z } from 'zod';
import { BookingRules } from '../../domain/value-objects/booking-rules';

export const bookingRulesResponseSchema = z.object({
  minimumAdvanceMinutes: z.number().int().meta({
    description: 'Antecedência mínima, em minutos (RN-02).',
    example: 60,
  }),
  cancellationDeadlineMinutes: z.number().int().meta({
    description: 'Prazo de cancelamento, em minutos antes do horário (RN-09).',
    example: 120,
  }),
  noShowLimit: z.number().int().meta({
    description: 'Limite de faltas (RN-12).',
    example: 2,
  }),
  waitlistOfferMinutes: z.number().int().meta({
    description: 'Prazo da oferta da lista de espera, em minutos (RN-16).',
    example: 15,
  }),
  returnReminderDays: z.number().int().meta({
    description: 'Dias para o lembrete de retorno (RN-19).',
    example: 30,
  }),
});

export type BookingRulesResponse = z.infer<typeof bookingRulesResponseSchema>;

export class BookingRulesPresenter {
  static toResponse(rules: BookingRules): BookingRulesResponse {
    return {
      minimumAdvanceMinutes: rules.minimumAdvanceMinutes,
      cancellationDeadlineMinutes: rules.cancellationDeadlineMinutes,
      noShowLimit: rules.noShowLimit,
      waitlistOfferMinutes: rules.waitlistOfferMinutes,
      returnReminderDays: rules.returnReminderDays,
    };
  }
}
