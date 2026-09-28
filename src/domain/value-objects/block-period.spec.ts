import { InvalidValueError } from '../errors/invalid-value.error';
import { BarbershopTimezone } from './barbershop-timezone';
import { BlockPeriod } from './block-period';

const SAO_PAULO = BarbershopTimezone.create('America/Sao_Paulo');

describe('BlockPeriod', () => {
  it('CA-09.1: resolves a local block to UTC in the barbershop timezone', () => {
    const period = BlockPeriod.resolve(
      { kind: 'block', localDate: '2026-10-01', start: '12:00', end: '13:00' },
      SAO_PAULO,
    );

    expect(period.start.toISOString()).toBe('2026-10-01T15:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-10-01T16:00:00.000Z');
  });

  it('CA-09.1: a block ending at 24:00 ends at the next local midnight', () => {
    const period = BlockPeriod.resolve(
      { kind: 'block', localDate: '2026-10-01', start: '18:00', end: '24:00' },
      SAO_PAULO,
    );

    expect(period.start.toISOString()).toBe('2026-10-01T21:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-10-02T03:00:00.000Z');
  });

  it('CA-09.2: resolves a day off to the whole local day', () => {
    const period = BlockPeriod.resolve(
      { kind: 'day_off', localDate: '2026-10-01' },
      SAO_PAULO,
    );

    expect(period.start.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-10-02T03:00:00.000Z');
  });

  it.each([
    ['equal to the start', '12:00', '12:00'],
    ['before the start', '13:00', '12:00'],
  ])(
    'CA-09.1: rejects an end %s with "O fim do bloqueio deve ser depois do início."',
    (_, start, end) => {
      expect(() =>
        BlockPeriod.resolve(
          { kind: 'block', localDate: '2026-10-01', start, end },
          SAO_PAULO,
        ),
      ).toThrow(
        new InvalidValueError('O fim do bloqueio deve ser depois do início.'),
      );
    },
  );
});
