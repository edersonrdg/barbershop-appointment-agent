import { z } from 'zod';
import { Client } from '../../domain/entities/client';
import { ClientProfile } from '../../usecases/get-client-profile/get-client-profile.use-case';
import {
  scheduleAppointmentSchema,
  SchedulePresenter,
} from './schedule.presenter';

const clientSummarySchema = z.object({
  id: z.string().meta({ format: 'uuid' }),
  name: z.string().meta({ example: 'João Silva' }),
  phone: z.string().meta({
    description: 'Telefone em E.164.',
    example: '+5511987654321',
  }),
});

export const clientListResponseSchema = z.object({
  clients: z.array(clientSummarySchema).meta({
    description:
      'No máximo 50 clientes, por nome (sem diferenciar maiúsculas) e depois por id.',
  }),
});

export const clientProfileResponseSchema = clientSummarySchema.extend({
  noShowCount: z.number().int().meta({
    description:
      'Faltas do cliente na barbearia desde o último reset, com qualquer barbeiro (RN-11, RN-13).',
    example: 1,
  }),
  selfBookingBlocked: z.boolean().meta({
    description:
      'true quando as faltas atingem o limite de faltas da barbearia: o cliente não agenda sozinho pelo bot (RN-12).',
    example: false,
  }),
  returnReminderEnabled: z.boolean().meta({
    description:
      'true quando o cliente aceitou o lembrete de retorno (RN-21). Começa desativado.',
    example: false,
  }),
  timezone: z.string().meta({
    description: 'Fuso da barbearia, para exibir os horários.',
    example: 'America/Sao_Paulo',
  }),
  pastAppointments: z.array(scheduleAppointmentSchema).meta({
    description:
      'Agendamentos com início até agora, em qualquer status, do mais recente ao mais antigo.',
  }),
  upcomingAppointments: z.array(scheduleAppointmentSchema).meta({
    description: 'Agendamentos com início depois de agora, do mais próximo.',
  }),
  topServices: z
    .array(
      z.object({
        id: z.string().meta({ format: 'uuid' }),
        name: z.string().meta({ example: 'Corte' }),
        count: z.number().int().meta({
          description: 'Agendamentos atendidos que incluem o serviço.',
          example: 3,
        }),
      }),
    )
    .meta({
      description:
        'Até 3 serviços dos agendamentos atendidos, por quantidade e depois por nome.',
    }),
});

export type ClientListResponse = z.infer<typeof clientListResponseSchema>;
export type ClientProfileResponse = z.infer<typeof clientProfileResponseSchema>;

export class ClientPresenter {
  static toList(clients: Client[]): ClientListResponse {
    return {
      clients: clients.map((client) => ({
        id: client.id,
        name: client.name,
        phone: client.phone,
      })),
    };
  }

  static toProfile(profile: ClientProfile): ClientProfileResponse {
    return {
      id: profile.client.id,
      name: profile.client.name,
      phone: profile.client.phone,
      noShowCount: profile.noShowCount,
      selfBookingBlocked: profile.selfBookingBlocked,
      returnReminderEnabled: profile.client.returnReminderEnabled,
      timezone: profile.timezone,
      pastAppointments: profile.pastAppointments.map((entry) =>
        SchedulePresenter.toAppointment(entry),
      ),
      upcomingAppointments: profile.upcomingAppointments.map((entry) =>
        SchedulePresenter.toAppointment(entry),
      ),
      topServices: profile.topServices.map((service) => ({ ...service })),
    };
  }
}
