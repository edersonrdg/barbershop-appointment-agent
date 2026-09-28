import { z } from 'zod';
import { Schedule } from '../../usecases/list-schedule/list-schedule.use-case';

const localDate = (description: string, example: string) =>
  z.string().meta({ description, format: 'date', example });

const instant = (description: string, example: string) =>
  z.string().meta({ description, format: 'date-time', example });

export const scheduleResponseSchema = z.object({
  view: z.enum(['day', 'week']).meta({ example: 'week' }),
  startDate: localDate('Primeiro dia do período (data local).', '2026-09-28'),
  endDate: localDate(
    'Último dia do período, inclusivo (data local).',
    '2026-10-04',
  ),
  timezone: z.string().meta({
    description: 'Fuso da barbearia, para exibir os horários.',
    example: 'America/Sao_Paulo',
  }),
  appointments: z
    .array(
      z.object({
        id: z.string().meta({ format: 'uuid' }),
        barber: z.object({
          id: z.string().meta({ format: 'uuid' }),
          name: z.string().meta({ example: 'Ana' }),
        }),
        client: z
          .object({
            id: z.string().meta({ format: 'uuid' }),
            name: z.string().meta({ example: 'João' }),
            phone: z.string().meta({
              description: 'Telefone em E.164.',
              example: '+5511987654321',
            }),
          })
          .nullable()
          .meta({ description: 'null quando o agendamento não tem cliente.' }),
        services: z
          .array(
            z.object({
              id: z.string().meta({ format: 'uuid' }),
              name: z.string().meta({ example: 'Corte' }),
            }),
          )
          .meta({ description: 'Na ordem em que foram agendados.' }),
        startsAt: instant('Início em UTC.', '2026-09-28T13:00:00.000Z'),
        endsAt: instant('Fim em UTC.', '2026-09-28T13:45:00.000Z'),
        status: z.enum(['confirmed']).meta({ example: 'confirmed' }),
        origin: z.enum(['bot', 'manual']).meta({
          description: 'bot (WhatsApp) ou manual (painel), RF-28.',
          example: 'manual',
        }),
      }),
    )
    .meta({
      description:
        'Agendamentos que começam no período, por início e depois por nome do barbeiro.',
    }),
});

export type ScheduleResponse = z.infer<typeof scheduleResponseSchema>;

export class SchedulePresenter {
  static toResponse(schedule: Schedule): ScheduleResponse {
    return {
      view: schedule.period.view,
      startDate: schedule.period.startDate,
      endDate: schedule.period.endDate,
      timezone: schedule.timezone,
      appointments: schedule.entries.map((entry) => ({
        id: entry.id,
        barber: { ...entry.barber },
        client: entry.client ? { ...entry.client } : null,
        services: entry.services.map((service) => ({ ...service })),
        startsAt: entry.startsAt.toISOString(),
        endsAt: entry.endsAt.toISOString(),
        status: entry.status,
        origin: entry.origin,
      })),
    };
  }
}
