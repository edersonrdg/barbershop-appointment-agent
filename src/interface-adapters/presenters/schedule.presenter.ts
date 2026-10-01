import { z } from 'zod';
import { Schedule } from '../../usecases/list-schedule/list-schedule.use-case';
import { ScheduleEntry } from '../../usecases/ports/schedule.query.port';

export const localDate = (description: string, example: string) =>
  z.string().meta({ description, format: 'date', example });

export const instant = (description: string, example: string) =>
  z.string().meta({ description, format: 'date-time', example });

export const scheduleAppointmentSchema = z.object({
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
  status: z.enum(['confirmed', 'attended', 'no_show', 'cancelled']).meta({
    description:
      'confirmed, attended (atendido) ou no_show (falta), RF-27; cancelled quando o cliente cancelou ou remarcou pelo WhatsApp (US-18), e o horário fica livre.',
    example: 'confirmed',
  }),
  origin: z.enum(['bot', 'manual']).meta({
    description: 'bot (WhatsApp) ou manual (painel), RF-28.',
    example: 'manual',
  }),
  clientConfirmedAt: z.string().nullable().meta({
    description:
      'Quando o cliente confirmou presença respondendo ao lembrete de 24h (US-19, CA-19.2), em UTC; null enquanto não confirmou.',
    format: 'date-time',
    example: '2026-09-29T15:00:00.000Z',
  }),
});

const scheduleItemSchema = scheduleAppointmentSchema.extend({
  unconfirmed: z.boolean().meta({
    description:
      'true quando o lembrete de 24h foi enviado, o cliente não confirmou e já chegou o prazo de cancelamento da barbearia (US-19, CA-19.5, RF-18): o painel mostra o alerta "não confirmado".',
    example: false,
  }),
});

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
  appointments: z.array(scheduleItemSchema).meta({
    description:
      'Agendamentos que começam no período, por início e depois por nome do barbeiro.',
  }),
});

export type ScheduleAppointmentResponse = z.infer<
  typeof scheduleAppointmentSchema
>;
export type ScheduleResponse = z.infer<typeof scheduleResponseSchema>;

export class SchedulePresenter {
  static toResponse(schedule: Schedule): ScheduleResponse {
    return {
      view: schedule.period.view,
      startDate: schedule.period.startDate,
      endDate: schedule.period.endDate,
      timezone: schedule.timezone,
      appointments: schedule.entries.map((entry) => ({
        ...SchedulePresenter.toAppointment(entry),
        unconfirmed: entry.unconfirmed,
      })),
    };
  }

  static toAppointment(entry: ScheduleEntry): ScheduleAppointmentResponse {
    return {
      id: entry.id,
      barber: { ...entry.barber },
      client: entry.client ? { ...entry.client } : null,
      services: entry.services.map((service) => ({ ...service })),
      startsAt: entry.startsAt.toISOString(),
      endsAt: entry.endsAt.toISOString(),
      status: entry.status,
      origin: entry.origin,
      clientConfirmedAt: entry.clientConfirmedAt?.toISOString() ?? null,
    };
  }
}
