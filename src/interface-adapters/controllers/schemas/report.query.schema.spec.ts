import { reportQuerySchema } from './report.query.schema';

const DATE_MESSAGE = 'Informe uma data válida no formato AAAA-MM-DD.';
const ORDER_MESSAGE =
  'A data final deve ser igual ou posterior à data inicial.';
const MAX_DAYS_MESSAGE = 'O período pode ter no máximo 92 dias.';
const BARBER_MESSAGE = 'Informe um id de barbeiro válido.';
const BARBER_ID = '7d3c2f7e-5b1a-4c8e-9f2d-1a2b3c4d5e6f';

function issuesOf(query: unknown) {
  const result = reportQuerySchema.safeParse(query);
  if (result.success) throw new Error('expected the schema to reject');
  return result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

describe('reportQuerySchema', () => {
  it('CA-26.1: accepts a period and a barber filter', () => {
    expect(
      reportQuerySchema.parse({
        from: '2026-10-01',
        to: '2026-10-31',
        barberId: BARBER_ID,
      }),
    ).toEqual({ from: '2026-10-01', to: '2026-10-31', barberId: BARBER_ID });
  });

  it('CA-26.1 (C9): rejects a missing from or to', () => {
    expect(issuesOf({ to: '2026-10-05' })).toEqual([
      { field: 'from', message: DATE_MESSAGE },
    ]);
    expect(issuesOf({ from: '2026-10-05' })).toEqual([
      { field: 'to', message: DATE_MESSAGE },
    ]);
  });

  it.each(['05/10/2026', '2026-02-30', '2026-10-5', ''])(
    'CA-26.1 (C9): rejects the date %p',
    (date) => {
      expect(issuesOf({ from: date, to: '2026-10-05' })).toEqual([
        { field: 'from', message: DATE_MESSAGE },
      ]);
      expect(issuesOf({ from: '2026-10-05', to: date })).toEqual([
        { field: 'to', message: DATE_MESSAGE },
      ]);
    },
  );

  it('CA-26.1 (C10): rejects a to before from and accepts a single day', () => {
    expect(issuesOf({ from: '2026-10-05', to: '2026-10-04' })).toEqual([
      { field: 'to', message: ORDER_MESSAGE },
    ]);
    expect(
      reportQuerySchema.parse({ from: '2026-10-05', to: '2026-10-05' }),
    ).toEqual({ from: '2026-10-05', to: '2026-10-05' });
  });

  it('CA-26.1 (C11): accepts 92 days and rejects 93, counting from and to', () => {
    expect(
      reportQuerySchema.parse({ from: '2026-01-01', to: '2026-04-02' }),
    ).toEqual({ from: '2026-01-01', to: '2026-04-02' });
    expect(issuesOf({ from: '2026-01-01', to: '2026-04-03' })).toEqual([
      { field: 'to', message: MAX_DAYS_MESSAGE },
    ]);
  });

  it('CA-26.1 (C12): rejects a barberId that is not a UUID', () => {
    expect(
      issuesOf({ from: '2026-10-05', to: '2026-10-05', barberId: 'abc' }),
    ).toEqual([{ field: 'barberId', message: BARBER_MESSAGE }]);
  });
});
