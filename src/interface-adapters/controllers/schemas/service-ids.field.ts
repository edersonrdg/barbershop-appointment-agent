import { z } from 'zod';

const MAX_SERVICES = 10;
const COUNT_MESSAGE = 'Escolha de 1 a 10 serviços.';
const SERVICE_ID_MESSAGE = 'Informe um id de serviço válido.';
const REPEATED_MESSAGE = 'Escolha cada serviço uma única vez.';
const DESCRIPTION =
  'Serviços escolhidos, de 1 a 10, sem repetir, na ordem em que serão feitos.';

const serviceIdList = z
  .array(z.uuid({ error: SERVICE_ID_MESSAGE }), { error: COUNT_MESSAGE })
  .min(1, COUNT_MESSAGE)
  .max(MAX_SERVICES, COUNT_MESSAGE)
  .refine((ids) => new Set(ids).size === ids.length, REPEATED_MESSAGE);

export const serviceIdsField = serviceIdList.meta({
  description: DESCRIPTION,
  example: ['0b8e7a52-3f1d-4c6a-9e2b-5d4f3a2c1b0e'],
});

export const serviceIdsQueryField = z
  .string({ error: COUNT_MESSAGE })
  .transform((value) => (value === '' ? [] : value.split(',')))
  .pipe(serviceIdList)
  .meta({
    description: `${DESCRIPTION} Ids separados por vírgula.`,
    example:
      '0b8e7a52-3f1d-4c6a-9e2b-5d4f3a2c1b0e,5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
  });
