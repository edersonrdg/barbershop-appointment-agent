import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppointmentStatus } from '../../src/domain/entities/appointment';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmNoShowLedger } from '../../src/infrastructure/database/repositories/typeorm-no-show-ledger';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const NOW = new Date('2026-12-30T12:00:00.000Z');
const CUTOFF = new Date('2026-10-01T12:00:00.000Z');

describe('TypeOrmNoShowLedger (e2e)', () => {
  let dataSource: DataSource;
  let ledger: TypeOrmNoShowLedger;
  let barbershopA: string;
  let barbershopB: string;
  let barberA: string;
  let barberB: string;
  let phoneSequence = 0;

  async function insertBarbershop(): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
       VALUES ($1, 'Barbearia', 'America/Sao_Paulo', 'trialing', now(), now())`,
      [id],
    );
    return id;
  }

  async function insertBarber(barbershopId: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbers (id, barbershop_id, name, user_id, active, created_at)
       VALUES ($1, $2, $3, NULL, true, now())`,
      [id, barbershopId, `Barbeiro ${id}`],
    );
    return id;
  }

  async function insertClient(
    barbershopId: string,
    noShowResetAt: string | null = null,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at, no_show_reset_at)
       VALUES ($1, $2, 'João', $3, now(), $4)`,
      [
        id,
        barbershopId,
        `+5511987650${String((phoneSequence += 1)).padStart(3, '0')}`,
        noShowResetAt,
      ],
    );
    return id;
  }

  async function insertAppointment(row: {
    clientId: string;
    startsAt: string;
    status: AppointmentStatus;
    barbershopId?: string;
    barberId?: string;
  }): Promise<void> {
    const startsAt = new Date(row.startsAt);
    await dataSource.query(
      `INSERT INTO appointments (id, barbershop_id, barber_id, client_id, starts_at, ends_at, status, origin, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', now())`,
      [
        randomUUID(),
        row.barbershopId ?? barbershopA,
        row.barberId ?? barberA,
        row.clientId,
        startsAt,
        new Date(startsAt.getTime() + 30 * 60 * 1000),
        row.status,
      ],
    );
  }

  async function resetAtOf(clientId: string): Promise<Date | null> {
    const [row] = await dataSource.query<{ no_show_reset_at: Date | null }[]>(
      'SELECT no_show_reset_at FROM clients WHERE id = $1',
      [clientId],
    );
    return row.no_show_reset_at;
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    ledger = new TypeOrmNoShowLedger(dataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    barbershopA = await insertBarbershop();
    barbershopB = await insertBarbershop();
    barberA = await insertBarber(barbershopA);
    barberB = await insertBarber(barbershopB);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  describe('countFor', () => {
    it('CA-11.2: counts only the no-shows of the client, ignoring attended, confirmed and other clients (RN-11, ATD-07)', async () => {
      const client = await insertClient(barbershopA);
      const other = await insertClient(barbershopA);
      await insertAppointment({
        clientId: client,
        startsAt: '2026-12-01T13:00:00Z',
        status: 'no_show',
      });
      await insertAppointment({
        clientId: client,
        startsAt: '2026-12-02T13:00:00Z',
        status: 'no_show',
      });
      await insertAppointment({
        clientId: client,
        startsAt: '2026-12-03T13:00:00Z',
        status: 'attended',
      });
      await insertAppointment({
        clientId: client,
        startsAt: '2026-12-04T13:00:00Z',
        status: 'confirmed',
      });
      await insertAppointment({
        clientId: other,
        startsAt: '2026-12-05T13:00:00Z',
        status: 'no_show',
      });

      expect(await ledger.countFor(barbershopA, client)).toBe(2);
      expect(await ledger.countFor(barbershopA, other)).toBe(1);
    });

    it('RN-26: counts only the appointments of the same barbershop (ATD-12)', async () => {
      const foreign = await insertClient(barbershopB);
      await insertAppointment({
        barbershopId: barbershopB,
        barberId: barberB,
        clientId: foreign,
        startsAt: '2026-12-01T13:00:00Z',
        status: 'no_show',
      });

      expect(await ledger.countFor(barbershopA, foreign)).toBe(0);
      expect(await ledger.countFor(barbershopB, foreign)).toBe(1);
    });

    it('RN-13: ignores the no-shows that started up to the last reset (ATD-15)', async () => {
      const client = await insertClient(barbershopA, '2026-11-01T13:00:00Z');
      await insertAppointment({
        clientId: client,
        startsAt: '2026-10-20T13:00:00Z',
        status: 'no_show',
      });
      await insertAppointment({
        clientId: client,
        startsAt: '2026-11-01T13:00:00Z',
        status: 'no_show',
      });
      await insertAppointment({
        clientId: client,
        startsAt: '2026-11-02T13:00:00Z',
        status: 'no_show',
      });

      expect(await ledger.countFor(barbershopA, client)).toBe(1);
    });
  });

  describe('resetExpired', () => {
    it('CA-11.3: resets the clients whose last counted no-show started at or before the cutoff and keeps the others (ATD-23, ATD-24)', async () => {
      const atCutoff = await insertClient(barbershopA);
      const beforeCutoff = await insertClient(barbershopA);
      const afterCutoff = await insertClient(barbershopA);
      const recentAfterOld = await insertClient(barbershopA);
      const withoutNoShow = await insertClient(barbershopA);
      await insertAppointment({
        clientId: atCutoff,
        startsAt: '2026-10-01T12:00:00Z',
        status: 'no_show',
      });
      await insertAppointment({
        clientId: beforeCutoff,
        startsAt: '2026-09-01T12:00:00Z',
        status: 'no_show',
      });
      await insertAppointment({
        clientId: afterCutoff,
        startsAt: '2026-10-02T12:00:00Z',
        status: 'no_show',
      });
      await insertAppointment({
        clientId: recentAfterOld,
        startsAt: '2026-08-01T12:00:00Z',
        status: 'no_show',
      });
      await insertAppointment({
        clientId: recentAfterOld,
        startsAt: '2026-12-01T12:00:00Z',
        status: 'no_show',
      });
      await insertAppointment({
        clientId: withoutNoShow,
        startsAt: '2026-08-02T12:00:00Z',
        status: 'attended',
      });

      const reset = await ledger.resetExpired(barbershopA, CUTOFF, NOW);

      expect(reset).toBe(2);
      expect(await resetAtOf(atCutoff)).toEqual(NOW);
      expect(await resetAtOf(beforeCutoff)).toEqual(NOW);
      expect(await resetAtOf(afterCutoff)).toBeNull();
      expect(await resetAtOf(recentAfterOld)).toBeNull();
      expect(await resetAtOf(withoutNoShow)).toBeNull();
      expect(await ledger.countFor(barbershopA, atCutoff)).toBe(0);
      expect(await ledger.countFor(barbershopA, beforeCutoff)).toBe(0);
      expect(await ledger.countFor(barbershopA, afterCutoff)).toBe(1);
      expect(await ledger.countFor(barbershopA, recentAfterOld)).toBe(2);
    });

    it('RN-26: does not touch the clients of another barbershop (ATD-23)', async () => {
      const foreign = await insertClient(barbershopB);
      await insertAppointment({
        barbershopId: barbershopB,
        barberId: barberB,
        clientId: foreign,
        startsAt: '2026-09-01T12:00:00Z',
        status: 'no_show',
      });

      const reset = await ledger.resetExpired(barbershopA, CUTOFF, NOW);

      expect(reset).toBe(0);
      expect(await resetAtOf(foreign)).toBeNull();
      expect(await ledger.countFor(barbershopB, foreign)).toBe(1);
    });

    it('RN-13: a second run returns 0 and changes nothing (ATD-25)', async () => {
      const client = await insertClient(barbershopA);
      await insertAppointment({
        clientId: client,
        startsAt: '2026-09-01T12:00:00Z',
        status: 'no_show',
      });
      await ledger.resetExpired(barbershopA, CUTOFF, NOW);

      const later = new Date(NOW.getTime() + 60 * 60 * 1000);
      const reset = await ledger.resetExpired(barbershopA, CUTOFF, later);

      expect(reset).toBe(0);
      expect(await resetAtOf(client)).toEqual(NOW);
      expect(await ledger.countFor(barbershopA, client)).toBe(0);
    });
  });
});
