import { z } from 'zod';
import { PanelSlots } from '../../usecases/list-panel-slots/list-panel-slots.use-case';
import { instant, localDate } from './schedule.presenter';

export const availableSlotsResponseSchema = z.object({
  date: localDate('Dia consultado (data local).', '2026-10-01'),
  timezone: z.string().meta({
    description: 'Fuso da barbearia, para exibir os horários.',
    example: 'America/Sao_Paulo',
  }),
  slots: z
    .array(
      z.object({
        barber: z
          .object({
            id: z.string().meta({ format: 'uuid' }),
            name: z.string().meta({ example: 'Ana' }),
          })
          .meta({
            description:
              'Barbeiro livre no início; sem barberId, o primeiro livre por nome.',
          }),
        startsAt: instant(
          'Início em UTC; envie-o como startsAt em POST /appointments.',
          '2026-10-01T13:00:00.000Z',
        ),
        endsAt: instant('Fim em UTC.', '2026-10-01T13:45:00.000Z'),
      }),
    )
    .meta({
      description:
        'Inícios livres por ordem crescente, a partir de agora e sem antecedência mínima. Vazio em dia fechado ou passado.',
    }),
});

export type AvailableSlotsResponse = z.infer<
  typeof availableSlotsResponseSchema
>;

export class AvailableSlotsPresenter {
  static toResponse(result: PanelSlots): AvailableSlotsResponse {
    return {
      date: result.date,
      timezone: result.timezone,
      slots: result.slots.map((slot) => ({
        barber: { ...slot.barber },
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      })),
    };
  }
}
