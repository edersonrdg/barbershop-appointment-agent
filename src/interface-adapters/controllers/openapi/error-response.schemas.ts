import { z } from 'zod';

export const messageResponseSchema = z.object({
  message: z.string().meta({ description: 'Mensagem para o usuário final.' }),
});

export const validationErrorResponseSchema = z.object({
  message: z.literal('Dados inválidos.'),
  errors: z.array(
    z.object({
      field: z.string().meta({
        description: 'Caminho do campo rejeitado, separado por ponto.',
        example: 'email',
      }),
      message: z.string().meta({ example: 'Informe um e-mail válido.' }),
    }),
  ),
});
