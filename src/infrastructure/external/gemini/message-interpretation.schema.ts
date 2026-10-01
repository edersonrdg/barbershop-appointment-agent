import { z } from 'zod';
import {
  BOOKING_PERIODS,
  MAX_CHOICE,
  MESSAGE_TOPICS,
} from '../../../usecases/ports/message-interpreter.port';

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// A date the calendar does not have (2026-02-30) is refused, not rolled over.
function isLocalDate(value: string): boolean {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// The only output accepted from the model (door 1). Also sent to Gemini as the
// response JSON Schema, so the descriptions are instructions to the model. The
// date and time formats are checked with `refine`, which the JSON Schema
// leaves out: Gemini does not document `pattern`.
export const messageInterpretationSchema = z.object({
  topics: z.array(z.enum(MESSAGE_TOPICS)).max(MESSAGE_TOPICS.length).meta({
    description:
      'Assuntos da barbearia perguntados: services (serviços, preços ou duração), address (endereço), opening_hours (horário de funcionamento).',
  }),
  services: z.array(z.string().min(1).max(80)).max(20).meta({
    description:
      'Nomes do catálogo, escritos exatamente como no catálogo, que o cliente citou ou quer agendar.',
  }),
  unknownServices: z.array(z.string().min(1).max(60)).max(3).meta({
    description:
      'Serviços que o cliente perguntou e que não estão no catálogo, como ele escreveu.',
  }),
  offTopic: z.boolean().meta({
    description: 'true quando a mensagem não tem relação com a barbearia.',
  }),
  humanRequested: z.boolean().meta({
    description:
      'true quando o cliente pede para falar com uma pessoa, atendente ou alguém da equipe.',
  }),
  bookingRequested: z.boolean().meta({
    description:
      'true quando o cliente quer marcar um horário ou responde ao agendamento em andamento.',
  }),
  barber: z.string().min(1).max(80).nullable().meta({
    description:
      'Nome do barbeiro que o cliente pediu, escrito exatamente como na lista de barbeiros; null quando não pediu.',
  }),
  anyBarber: z.boolean().meta({
    description:
      'true quando o cliente diz que não tem preferência de barbeiro (por exemplo, "tanto faz", "qualquer um").',
  }),
  date: z.string().refine(isLocalDate).nullable().meta({
    description:
      'Data pedida no formato AAAA-MM-DD, calculada a partir da data de hoje; null quando o cliente não disse o dia.',
    format: 'date',
  }),
  period: z.enum(BOOKING_PERIODS).nullable().meta({
    description:
      'Período pedido: morning (manhã), afternoon (tarde), evening (noite); null quando não disse.',
  }),
  time: z
    .string()
    .refine((value) => LOCAL_TIME_PATTERN.test(value))
    .nullable()
    .meta({
      description:
        'Hora exata pedida no formato HH:MM (24 horas); null quando não disse.',
      format: 'time',
    }),
  cancelRequested: z.boolean().meta({
    description: 'true quando o cliente quer cancelar um agendamento.',
  }),
  rescheduleRequested: z.boolean().meta({
    description:
      'true quando o cliente quer remarcar (trocar o dia ou o horário de) um agendamento.',
  }),
  confirmRequested: z.boolean().meta({
    description:
      'true quando o cliente confirma que vai comparecer ao agendamento.',
  }),
  choice: z.int().min(1).max(MAX_CHOICE).nullable().meta({
    description:
      'Número da opção listada (horário oferecido ou agendamento do cliente) que o cliente escolheu; null quando não escolheu.',
  }),
});
