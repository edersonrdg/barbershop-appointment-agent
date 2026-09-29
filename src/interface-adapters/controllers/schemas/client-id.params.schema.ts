import { z } from 'zod';

export const clientIdParamsSchema = z.object({
  id: z.uuid({ error: 'Informe um id de cliente válido.' }),
});

export type ClientIdParams = z.infer<typeof clientIdParamsSchema>;
