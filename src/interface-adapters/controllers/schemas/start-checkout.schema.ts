import { z } from 'zod';
import { PAYMENT_METHODS } from '../../../domain/entities/barbershop-subscription';
import {
  CPF_CNPJ_MESSAGE,
  CpfCnpj,
} from '../../../domain/value-objects/cpf-cnpj';

const METHOD_MESSAGE =
  'Escolha o pagamento por cartão (credit_card) ou Pix (pix).';
export const PIX_DOCUMENT_MESSAGE = 'Informe o CPF ou CNPJ para pagar com Pix.';

export type StartCheckoutBody =
  { method: 'credit_card' } | { method: 'pix'; cpfCnpj: string };

export const startCheckoutSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS, { error: METHOD_MESSAGE }).meta({
      description:
        '`credit_card` abre o checkout recorrente do Asaas; `pix` cria uma assinatura com uma fatura Pix por mês.',
      example: 'pix',
    }),
    cpfCnpj: z
      .string({ error: CPF_CNPJ_MESSAGE })
      .refine((value) => CpfCnpj.isValid(value), CPF_CNPJ_MESSAGE)
      .optional()
      .meta({
        description:
          'CPF ou CNPJ do pagador, com ou sem pontuação. Obrigatório no Pix; vai só para o Asaas e não é guardado.',
        example: '529.982.247-25',
      }),
  })
  .superRefine((body, context) => {
    if (body.method === 'pix' && body.cpfCnpj === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['cpfCnpj'],
        message: PIX_DOCUMENT_MESSAGE,
      });
    }
  })
  .transform((body): StartCheckoutBody =>
    body.method === 'pix'
      ? { method: 'pix', cpfCnpj: body.cpfCnpj ?? '' }
      : { method: 'credit_card' },
  );
