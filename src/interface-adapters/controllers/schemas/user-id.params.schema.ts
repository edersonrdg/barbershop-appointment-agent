import { z } from 'zod';

export const userIdParamsSchema = z.object({
  id: z.uuid({ error: 'Informe um id de usuário válido.' }),
});

export type UserIdParams = z.infer<typeof userIdParamsSchema>;
