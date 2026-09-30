import { z } from 'zod';
import { MESSAGE_TOPICS } from '../../../usecases/ports/message-interpreter.port';

// The only output accepted from the model (door 1). Also sent to Gemini as the
// response JSON Schema, so the descriptions are instructions to the model.
export const messageInterpretationSchema = z.object({
  topics: z.array(z.enum(MESSAGE_TOPICS)).max(MESSAGE_TOPICS.length).meta({
    description:
      'Assuntos da barbearia perguntados: services (serviços, preços ou duração), address (endereço), opening_hours (horário de funcionamento).',
  }),
  services: z.array(z.string().min(1).max(80)).max(20).meta({
    description:
      'Nomes do catálogo, escritos exatamente como no catálogo, que o cliente citou.',
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
});
