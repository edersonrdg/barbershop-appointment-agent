import { z } from 'zod';

export const conversationClientParamsSchema = z.object({
  clientId: z.uuid({ error: 'Informe um id de cliente válido.' }),
});

export type ConversationClientParams = z.infer<
  typeof conversationClientParamsSchema
>;
