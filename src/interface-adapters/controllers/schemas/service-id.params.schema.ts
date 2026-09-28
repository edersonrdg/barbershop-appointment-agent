import { z } from 'zod';

export const serviceIdParamsSchema = z.object({
  serviceId: z.uuid({ error: 'Informe um id de serviço válido.' }),
});

export type ServiceIdParams = z.infer<typeof serviceIdParamsSchema>;
