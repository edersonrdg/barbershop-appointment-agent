import { z } from 'zod';
import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  ServiceDuration,
} from '../../../domain/value-objects/service-duration';
import {
  MAX_PRICE_CENTS,
  MIN_PRICE_CENTS,
  ServicePrice,
} from '../../../domain/value-objects/service-price';

const MAX_ADD_ONS = 5;

const NAME_MESSAGE = 'Informe o nome do serviço, com 2 a 60 caracteres.';
const PRICE_MESSAGE = 'Informe o preço em centavos, de 0 a 1000000.';
const DURATION_MESSAGE =
  'Informe a duração em minutos, de 5 a 480, em múltiplos de 5.';
const ADD_ONS_MESSAGE = 'Escolha até 5 serviços adicionais, sem repetir.';
const ADD_ON_ID_MESSAGE = 'Informe um id de serviço adicional válido.';

export const serviceSchema = z.object({
  name: z
    .string({ error: NAME_MESSAGE })
    .trim()
    .min(2, NAME_MESSAGE)
    .max(60, NAME_MESSAGE)
    .meta({ example: 'Corte' }),
  priceCents: z
    .number({ error: PRICE_MESSAGE })
    .refine((value) => ServicePrice.isValid(value), PRICE_MESSAGE)
    .meta({
      description: 'Preço em centavos de real (inteiro).',
      minimum: MIN_PRICE_CENTS,
      maximum: MAX_PRICE_CENTS,
      example: 4500,
    }),
  durationMinutes: z
    .number({ error: DURATION_MESSAGE })
    .refine((value) => ServiceDuration.isValid(value), DURATION_MESSAGE)
    .meta({
      description: 'Duração em minutos, múltiplo de 5.',
      minimum: MIN_DURATION_MINUTES,
      maximum: MAX_DURATION_MINUTES,
      example: 30,
    }),
  suggestedAddOnIds: z
    .array(z.uuid({ error: ADD_ON_ID_MESSAGE }), { error: ADD_ONS_MESSAGE })
    .max(MAX_ADD_ONS, ADD_ONS_MESSAGE)
    .refine((ids) => new Set(ids).size === ids.length, ADD_ONS_MESSAGE)
    .default([])
    .meta({
      description:
        'Serviços ativos da mesma barbearia sugeridos como adicionais; substitui a lista inteira.',
    }),
});

export type ServiceBody = z.infer<typeof serviceSchema>;
