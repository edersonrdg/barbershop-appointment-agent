import { z } from 'zod';

const SEARCH_MESSAGE = 'Informe de 2 a 80 caracteres para buscar.';

export const clientSearchQuerySchema = z.object({
  q: z
    .string({ error: SEARCH_MESSAGE })
    .trim()
    .min(2, SEARCH_MESSAGE)
    .max(80, SEARCH_MESSAGE)
    .optional()
    .meta({
      description:
        'Parte do nome, sem diferenciar maiúsculas, ou 4 ou mais dígitos do telefone. Sem o termo, lista os clientes sem filtro.',
      example: 'joão',
    }),
});

export type ClientSearchQueryParams = z.infer<typeof clientSearchQuerySchema>;
