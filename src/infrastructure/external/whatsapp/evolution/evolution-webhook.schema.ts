import { z } from 'zod';

// Only the envelope is validated: every event of the Evolution API carries it,
// and events this API does not handle are acknowledged and ignored.
export const evolutionWebhookSchema = z.looseObject({
  event: z.string().meta({
    description: 'Evento da Evolution API, em minúsculas com ponto.',
    example: 'connection.update',
  }),
  instance: z.string().meta({
    description: 'Nome da instância, que é o id da barbearia (AD-011).',
    example: '0b9f7d8e-8a55-4c1c-9d51-6f2f3d1f0a11',
  }),
  data: z
    .unknown()
    .optional()
    .meta({
      description:
        'Dados do evento; em `connection.update`, traz `state`; em `messages.upsert`, a mensagem (`key`, `pushName`, `messageTimestamp`).',
      example: { state: 'close', statusReason: 401 },
    }),
});

export type EvolutionWebhook = z.infer<typeof evolutionWebhookSchema>;

// US-14: only what identifies the client of a `messages.upsert`; the message
// content is not read.
export const evolutionMessageSchema = z.looseObject({
  key: z.looseObject({
    remoteJid: z.string(),
    fromMe: z.boolean(),
  }),
  pushName: z.string().nullish(),
  messageTimestamp: z.number(),
});
