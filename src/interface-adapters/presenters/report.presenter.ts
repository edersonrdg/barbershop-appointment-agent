import { z } from 'zod';
import { BarbershopReport } from '../../usecases/get-barbershop-report/get-barbershop-report.use-case';
import { localDate } from './schedule.presenter';

const percent = (description: string, example: number) =>
  z.number().nullable().meta({ description, example });

export const reportResponseSchema = z.object({
  from: localDate('Primeiro dia do período.', '2026-10-01'),
  to: localDate('Último dia do período, incluído.', '2026-10-31'),
  barberId: z.string().nullable().meta({
    description: 'Barbeiro do filtro; null quando o relatório é de todos.',
    format: 'uuid',
  }),
  totalAppointments: z.number().int().meta({
    description:
      'Agendamentos que começam no período, de todos os status (RF-38).',
    example: 120,
  }),
  cancellations: z.number().int().meta({
    description:
      'Agendamentos cancelados do período; a remarcação conta como cancelamento do agendamento antigo.',
    example: 12,
  }),
  noShows: z.number().int().meta({
    description: 'Agendamentos marcados como falta (RF-38).',
    example: 4,
  }),
  occupancyPercent: percent(
    'Minutos agendados (confirmados, atendidos e faltas) ÷ minutos de jornada (jornada do barbeiro dentro do horário da barbearia, menos bloqueios e folgas), com os horários atuais e só barbeiros ativos. De 0 a 100, uma casa decimal; null quando o período não tem jornada.',
    62.5,
  ),
  estimatedRevenueCents: z.number().int().meta({
    description:
      'Soma do preço atual dos serviços dos atendimentos marcados como atendido, em centavos (RF-38).',
    example: 480000,
  }),
  botBookedPercent: percent(
    'Agendamentos feitos pelo bot ÷ total de agendamentos do período (RF-39). De 0 a 100, uma casa decimal; null quando o período não tem agendamentos.',
    75,
  ),
});

export type ReportResponse = z.infer<typeof reportResponseSchema>;

export class ReportPresenter {
  static toResponse(report: BarbershopReport): ReportResponse {
    return { ...report };
  }
}
