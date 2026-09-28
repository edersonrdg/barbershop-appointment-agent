import { z } from 'zod';

export const blockIdParamsSchema = z.object({
  blockId: z.uuid({ error: 'Informe um id de bloqueio válido.' }),
});

export type BlockIdParams = z.infer<typeof blockIdParamsSchema>;
