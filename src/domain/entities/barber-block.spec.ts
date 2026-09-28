import { InvalidValueError } from '../errors/invalid-value.error';
import { BarberBlock, BarberBlockKind } from './barber-block';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const LUNCH = {
  start: new Date('2026-10-01T15:00:00.000Z'),
  end: new Date('2026-10-01T16:00:00.000Z'),
};

function createBlock(
  overrides: {
    kind?: BarberBlockKind;
    period?: { start: Date; end: Date };
    reason?: string | null;
  } = {},
): BarberBlock {
  return BarberBlock.create({
    id: 'block-1',
    barbershopId: 'barbershop-a',
    barberId: 'barber-1',
    kind: overrides.kind ?? 'block',
    period: overrides.period ?? LUNCH,
    reason: 'reason' in overrides ? overrides.reason : 'Almoço',
    now: NOW,
  });
}

function describeBlock(block: BarberBlock) {
  return {
    id: block.id,
    barbershopId: block.barbershopId,
    barberId: block.barberId,
    kind: block.kind,
    startsAt: block.startsAt.toISOString(),
    endsAt: block.endsAt.toISOString(),
    reason: block.reason,
    createdAt: block.createdAt,
  };
}

describe('BarberBlock', () => {
  it.each(['block', 'day_off'] as const)(
    'CA-09.1: creates a %s with its kind, UTC period and reason',
    (kind) => {
      expect(describeBlock(createBlock({ kind }))).toEqual({
        id: 'block-1',
        barbershopId: 'barbershop-a',
        barberId: 'barber-1',
        kind,
        startsAt: '2026-10-01T15:00:00.000Z',
        endsAt: '2026-10-01T16:00:00.000Z',
        reason: 'Almoço',
        createdAt: NOW,
      });
    },
  );

  it('CA-09.1: trims the spaces around the reason', () => {
    expect(createBlock({ reason: '  Consulta médica  ' }).reason).toBe(
      'Consulta médica',
    );
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['null', null],
    ['absent', undefined],
  ])('CA-09.1: an %s reason becomes null', (_, reason) => {
    expect(createBlock({ reason }).reason).toBeNull();
  });

  it('CA-09.1: accepts a reason with 120 characters', () => {
    const reason = 'a'.repeat(120);

    expect(createBlock({ reason }).reason).toBe(reason);
  });

  it('CA-09.1: rejects a reason with 121 characters', () => {
    expect(() => createBlock({ reason: 'a'.repeat(121) })).toThrow(
      new InvalidValueError('Informe um motivo de até 120 caracteres.'),
    );
  });

  it.each([
    ['equal to the start', LUNCH.start],
    ['before the start', new Date('2026-10-01T14:59:00.000Z')],
  ])('CA-09.1: rejects an end %s', (_, end) => {
    expect(() => createBlock({ period: { start: LUNCH.start, end } })).toThrow(
      new InvalidValueError('O fim do bloqueio deve ser depois do início.'),
    );
  });

  it('CA-09.1: restore keeps every stored value', () => {
    const block = BarberBlock.restore({
      id: 'block-2',
      barbershopId: 'barbershop-a',
      barberId: 'barber-2',
      kind: 'day_off',
      startsAt: new Date('2026-10-01T03:00:00.000Z'),
      endsAt: new Date('2026-10-02T03:00:00.000Z'),
      reason: null,
      createdAt: NOW,
    });

    expect(describeBlock(block)).toEqual({
      id: 'block-2',
      barbershopId: 'barbershop-a',
      barberId: 'barber-2',
      kind: 'day_off',
      startsAt: '2026-10-01T03:00:00.000Z',
      endsAt: '2026-10-02T03:00:00.000Z',
      reason: null,
      createdAt: NOW,
    });
  });
});
