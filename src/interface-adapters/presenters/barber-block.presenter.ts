import { z } from 'zod';
import { BarberBlockConflictError } from '../../usecases/create-barber-block/barber-block-conflict.error';
import { CreatedBarberBlock } from '../../usecases/create-barber-block/create-barber-block.use-case';
import { BarberBlockList } from '../../usecases/list-barber-blocks/list-barber-blocks.use-case';
import { BarberBlockView } from '../../usecases/ports/barber-block.repository.port';
import {
  instant,
  localDate,
  scheduleAppointmentSchema,
  SchedulePresenter,
} from './schedule.presenter';

export const barberBlockResponseSchema = z.object({
  id: z.string().meta({ format: 'uuid' }),
  barber: z.object({
    id: z.string().meta({ format: 'uuid' }),
    name: z.string().meta({ example: 'Bruno' }),
  }),
  kind: z.enum(['block', 'day_off']).meta({
    description: 'block: bloqueio de horário. day_off: folga do dia inteiro.',
    example: 'block',
  }),
  startsAt: instant('Início em UTC.', '2026-10-01T15:00:00.000Z'),
  endsAt: instant('Fim em UTC.', '2026-10-01T16:00:00.000Z'),
  reason: z.string().nullable().meta({
    description: 'Motivo; null quando não informado.',
    example: 'Almoço',
  }),
});

export const createBarberBlockResponseSchema = z.object({
  block: barberBlockResponseSchema,
  affectedAppointments: z.array(scheduleAppointmentSchema).meta({
    description:
      'Agendamentos confirmados que o bloqueio atinge, por início. Nenhum é cancelado (CA-09.3); vazio quando não há conflito.',
  }),
});

export const barberBlockConflictResponseSchema = z.object({
  message: z.string().meta({
    example: 'O bloqueio conflita com agendamentos existentes.',
  }),
  appointments: z.array(scheduleAppointmentSchema).meta({
    description:
      'Agendamentos confirmados que o bloqueio atingiria, por início. Reenvie com confirmConflicts: true para gravar mesmo assim.',
  }),
});

export const barberBlockListResponseSchema = z.object({
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
  blocks: z.array(barberBlockResponseSchema).meta({
    description:
      'Bloqueios e folgas que começam no período, por início, nome do barbeiro e id.',
  }),
});

export type BarberBlockResponse = z.infer<typeof barberBlockResponseSchema>;
export type CreateBarberBlockResponse = z.infer<
  typeof createBarberBlockResponseSchema
>;
export type BarberBlockConflictResponse = z.infer<
  typeof barberBlockConflictResponseSchema
>;
export type BarberBlockListResponse = z.infer<
  typeof barberBlockListResponseSchema
>;

export class BarberBlockPresenter {
  static toResponse(block: BarberBlockView): BarberBlockResponse {
    return {
      id: block.id,
      barber: { ...block.barber },
      kind: block.kind,
      startsAt: block.startsAt.toISOString(),
      endsAt: block.endsAt.toISOString(),
      reason: block.reason,
    };
  }

  static toCreated(created: CreatedBarberBlock): CreateBarberBlockResponse {
    return {
      block: BarberBlockPresenter.toResponse(created.block),
      affectedAppointments: created.affectedAppointments.map((entry) =>
        SchedulePresenter.toAppointment(entry),
      ),
    };
  }

  static toConflict(
    error: BarberBlockConflictError,
  ): BarberBlockConflictResponse {
    return {
      message: error.message,
      appointments: error.appointments.map((entry) =>
        SchedulePresenter.toAppointment(entry),
      ),
    };
  }

  static toList(list: BarberBlockList): BarberBlockListResponse {
    return {
      view: list.period.view,
      startDate: list.period.startDate,
      endDate: list.period.endDate,
      timezone: list.timezone,
      blocks: list.blocks.map((block) =>
        BarberBlockPresenter.toResponse(block),
      ),
    };
  }
}
