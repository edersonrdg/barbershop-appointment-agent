import { z } from 'zod';

export const barberIdParamsSchema = z.object({
  barberId: z.uuid({ error: 'Informe um id de barbeiro válido.' }),
});

export type BarberIdParams = z.infer<typeof barberIdParamsSchema>;
