import { createBarberBlockSchema } from './barber-block.schema';
import { blockIdParamsSchema } from './block-id.params.schema';

const KIND_MESSAGE = 'Escolha o tipo: block ou day_off.';
const BARBER_MESSAGE = 'Informe um id de barbeiro válido.';
const DATE_MESSAGE = 'Informe uma data válida no formato AAAA-MM-DD.';
const TIME_MESSAGE = 'Informe um horário válido no formato HH:mm.';
const END_MESSAGE = 'O fim do bloqueio deve ser depois do início.';
const REASON_MESSAGE = 'Informe um motivo de até 120 caracteres.';
const BARBER_ID = '7d3c2f7e-5b1a-4c8e-9f2d-1a2b3c4d5e6f';

const block = {
  kind: 'block',
  barberId: BARBER_ID,
  date: '2026-10-01',
  start: '12:00',
  end: '13:00',
};
const dayOff = { kind: 'day_off', barberId: BARBER_ID, date: '2026-10-01' };

function issuesOf(body: unknown) {
  const result = createBarberBlockSchema.safeParse(body);
  if (result.success) throw new Error('expected the schema to reject');
  return result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

describe('createBarberBlockSchema', () => {
  it('CA-09.1: accepts a block with reason and confirmation', () => {
    expect(
      createBarberBlockSchema.parse({
        ...block,
        reason: '  Almoço  ',
        confirmConflicts: true,
      }),
    ).toEqual({ ...block, reason: 'Almoço', confirmConflicts: true });
  });

  it('CA-09.1: accepts a block without reason and confirmation', () => {
    expect(createBarberBlockSchema.parse(block)).toEqual(block);
  });

  it('CA-09.1: accepts 24:00 as the end of a block', () => {
    expect(createBarberBlockSchema.parse({ ...block, end: '24:00' })).toEqual({
      ...block,
      end: '24:00',
    });
  });

  it('CA-09.2: accepts a day off and drops start and end', () => {
    expect(
      createBarberBlockSchema.parse({ ...dayOff, start: '12:00', end: '1' }),
    ).toEqual(dayOff);
  });

  it.each(['holiday', 'BLOCK', '', undefined])(
    'BLQ-19: rejects the kind %p with "Escolha o tipo: block ou day_off."',
    (kind) => {
      expect(issuesOf({ ...block, kind })).toEqual([
        { field: 'kind', message: KIND_MESSAGE },
      ]);
    },
  );

  it.each([block, dayOff])(
    'BLQ-19: rejects a barber id that is not a UUID',
    (body) => {
      expect(issuesOf({ ...body, barberId: 'ana' })).toEqual([
        { field: 'barberId', message: BARBER_MESSAGE },
      ]);
    },
  );

  it.each(['2026-02-30', '2026-13-01', '01/10/2026', '2026-10-1', ''])(
    'BLQ-19: rejects the date %p',
    (date) => {
      expect(issuesOf({ ...dayOff, date })).toEqual([
        { field: 'date', message: DATE_MESSAGE },
      ]);
    },
  );

  it.each(['24:00', '12h', '9:00', '12:60', ''])(
    'BLQ-19: rejects the start %p',
    (start) => {
      expect(issuesOf({ ...block, start, end: '24:00' })).toEqual([
        { field: 'start', message: TIME_MESSAGE },
      ]);
    },
  );

  it.each(['24:01', '25:00', '13', ''])('BLQ-19: rejects the end %p', (end) => {
    expect(issuesOf({ ...block, end })).toEqual([
      { field: 'end', message: TIME_MESSAGE },
    ]);
  });

  it('BLQ-19: a block requires start and end', () => {
    expect(
      issuesOf({ kind: 'block', barberId: BARBER_ID, date: '2026-10-01' }),
    ).toEqual([
      { field: 'start', message: TIME_MESSAGE },
      { field: 'end', message: TIME_MESSAGE },
    ]);
  });

  it.each([
    ['12:00', '12:00'],
    ['13:00', '12:00'],
  ])(
    'BLQ-19: rejects start %p and end %p with "O fim do bloqueio deve ser depois do início."',
    (start, end) => {
      expect(issuesOf({ ...block, start, end })).toEqual([
        { field: 'end', message: END_MESSAGE },
      ]);
    },
  );

  it('CA-09.1: accepts a reason with 120 characters', () => {
    expect(
      createBarberBlockSchema.parse({ ...block, reason: 'a'.repeat(120) })
        .reason,
    ).toBe('a'.repeat(120));
  });

  it.each([block, dayOff])(
    'BLQ-19: rejects a reason with 121 characters',
    (body) => {
      expect(issuesOf({ ...body, reason: 'a'.repeat(121) })).toEqual([
        { field: 'reason', message: REASON_MESSAGE },
      ]);
    },
  );

  it('BLQ-19: requires the barber and the date', () => {
    expect(issuesOf({ kind: 'day_off' })).toEqual([
      { field: 'barberId', message: BARBER_MESSAGE },
      { field: 'date', message: DATE_MESSAGE },
    ]);
  });
});

describe('blockIdParamsSchema', () => {
  it('BLQ-24: accepts a UUID', () => {
    expect(blockIdParamsSchema.parse({ blockId: BARBER_ID })).toEqual({
      blockId: BARBER_ID,
    });
  });

  it('BLQ-24: rejects a block id that is not a UUID', () => {
    const result = blockIdParamsSchema.safeParse({ blockId: 'lunch' });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Informe um id de bloqueio válido.',
    ]);
  });
});
