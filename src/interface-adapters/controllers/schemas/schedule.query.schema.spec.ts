import { scheduleQuerySchema } from './schedule.query.schema';

const VIEW_MESSAGE = 'Escolha a visão: day ou week.';
const DATE_MESSAGE = 'Informe uma data válida no formato AAAA-MM-DD.';
const BARBER_MESSAGE = 'Informe um id de barbeiro válido.';
const BARBER_ID = '7d3c2f7e-5b1a-4c8e-9f2d-1a2b3c4d5e6f';

function issuesOf(query: unknown) {
  const result = scheduleQuerySchema.safeParse(query);
  if (result.success) throw new Error('expected the schema to reject');
  return result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

describe('scheduleQuerySchema', () => {
  it.each(['day', 'week'])(
    'CA-08.1: accepts the %s view with a date and no barber',
    (view) => {
      expect(scheduleQuerySchema.parse({ view, date: '2026-09-28' })).toEqual({
        view,
        date: '2026-09-28',
      });
    },
  );

  it('CA-08.1: accepts a barber filter', () => {
    expect(
      scheduleQuerySchema.parse({
        view: 'day',
        date: '2026-09-28',
        barberId: BARBER_ID,
      }),
    ).toEqual({ view: 'day', date: '2026-09-28', barberId: BARBER_ID });
  });

  it.each(['month', 'DAY', ''])('AGD-24: rejects the view %p', (view) => {
    expect(issuesOf({ view, date: '2026-09-28' })).toEqual([
      { field: 'view', message: VIEW_MESSAGE },
    ]);
  });

  it.each(['2026-02-30', '2026-13-01', '28/09/2026', '2026-9-28', ''])(
    'AGD-24: rejects the date %p',
    (date) => {
      expect(issuesOf({ view: 'day', date })).toEqual([
        { field: 'date', message: DATE_MESSAGE },
      ]);
    },
  );

  it('AGD-24: rejects a barber id that is not a UUID', () => {
    expect(
      issuesOf({ view: 'day', date: '2026-09-28', barberId: 'ana' }),
    ).toEqual([{ field: 'barberId', message: BARBER_MESSAGE }]);
  });

  it('AGD-24: requires the view and the date', () => {
    expect(issuesOf({})).toEqual([
      { field: 'view', message: VIEW_MESSAGE },
      { field: 'date', message: DATE_MESSAGE },
    ]);
  });
});
