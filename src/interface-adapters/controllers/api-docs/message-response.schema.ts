import { z } from 'zod';

export const messageResponseSchema = z.object({
  message: z.string().meta({ description: 'Mensagem para o usuário final.' }),
});

export const validationErrorResponseSchema = z.object({
  message: z.string().meta({ example: 'Dados inválidos.' }),
  errors: z.array(
    z.object({
      field: z.string().meta({
        description: 'Caminho do campo inválido, separado por ponto.',
        example: 'openingHours.monday.opensAt',
      }),
      message: z.string().meta({
        example: 'Informe o horário no formato HH:mm, entre 00:00 e 23:59.',
      }),
    }),
  ),
});

export type MessageResponse = z.infer<typeof messageResponseSchema>;
export type ValidationErrorResponse = z.infer<
  typeof validationErrorResponseSchema
>;
