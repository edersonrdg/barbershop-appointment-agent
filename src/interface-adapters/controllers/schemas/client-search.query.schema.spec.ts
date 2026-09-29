import { clientSearchQuerySchema } from './client-search.query.schema';
import { clientIdParamsSchema } from './client-id.params.schema';

const SEARCH_MESSAGE = 'Informe de 2 a 80 caracteres para buscar.';
const CLIENT_ID_MESSAGE = 'Informe um id de cliente válido.';

function issuesOf(schema: typeof clientSearchQuerySchema, value: unknown) {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected the schema to reject');
  return result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

describe('clientSearchQuerySchema', () => {
  it('CA-12.1: accepts a search without a term', () => {
    expect(clientSearchQuerySchema.parse({})).toEqual({});
  });

  it.each([
    ['2', 'Jo', 'Jo'],
    ['80', 'a'.repeat(80), 'a'.repeat(80)],
    ['2 after trimming', '  Jo  ', 'Jo'],
  ])(
    'CA-12.1 (C6): accepts a term with %s characters',
    (_length, q, expected) => {
      expect(clientSearchQuerySchema.parse({ q })).toEqual({ q: expected });
    },
  );

  it.each([
    ['1', 'a'],
    ['81', 'a'.repeat(81)],
    ['1 after trimming', '  a  '],
    ['0 after trimming', '   '],
  ])(
    'CA-12.1 (C6): rejects a term with %s characters with the exact message',
    (_length, q) => {
      expect(issuesOf(clientSearchQuerySchema, { q })).toEqual([
        { field: 'q', message: SEARCH_MESSAGE },
      ]);
    },
  );
});

describe('clientIdParamsSchema', () => {
  it('CA-12.2: accepts a UUID', () => {
    const id = '7d3c2f7e-5b1a-4c8e-9f2d-1a2b3c4d5e6f';

    expect(clientIdParamsSchema.parse({ id })).toEqual({ id });
  });

  it.each(['abc', '123', ''])(
    'CA-12.2 (C16): rejects the id %p with the exact message',
    (id) => {
      const result = clientIdParamsSchema.safeParse({ id });

      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.message)).toEqual([
        CLIENT_ID_MESSAGE,
      ]);
    },
  );
});
