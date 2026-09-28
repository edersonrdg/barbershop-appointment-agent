import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  BookingRules,
  BookingRulesProps,
} from '../../src/domain/value-objects/booking-rules';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmBookingRulesRepository } from '../../src/infrastructure/database/repositories/typeorm-booking-rules.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const RULES_A: BookingRulesProps = {
  minimumAdvanceMinutes: 60,
  cancellationDeadlineMinutes: 120,
  noShowLimit: 2,
  waitlistOfferMinutes: 15,
  returnReminderDays: 30,
};

const RULES_B: BookingRulesProps = {
  minimumAdvanceMinutes: 90,
  cancellationDeadlineMinutes: 180,
  noShowLimit: 4,
  waitlistOfferMinutes: 25,
  returnReminderDays: 60,
};

const NEW_RULES: BookingRulesProps = {
  minimumAdvanceMinutes: 30,
  cancellationDeadlineMinutes: 240,
  noShowLimit: 3,
  waitlistOfferMinutes: 20,
  returnReminderDays: 45,
};

function toPlain(rules: BookingRules | null): BookingRulesProps | null {
  if (!rules) return null;
  return {
    minimumAdvanceMinutes: rules.minimumAdvanceMinutes,
    cancellationDeadlineMinutes: rules.cancellationDeadlineMinutes,
    noShowLimit: rules.noShowLimit,
    waitlistOfferMinutes: rules.waitlistOfferMinutes,
    returnReminderDays: rules.returnReminderDays,
  };
}

describe('TypeOrmBookingRulesRepository (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmBookingRulesRepository;
  let barbershopA: string;
  let barbershopB: string;

  async function insertBarbershop(name: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbershops (id, name, address, timezone, subscription_status, trial_ends_at, created_at)
       VALUES ($1, $2, 'Rua das Flores, 123', 'America/Manaus', 'trialing', now(), now())`,
      [id, name],
    );
    await dataSource.query(
      `INSERT INTO barbershop_opening_hours (barbershop_id, weekday, opens_at, closes_at, break_starts_at, break_ends_at)
       VALUES ($1, 1, '09:00', '19:00', '12:00', '13:00')`,
      [id],
    );
    return id;
  }

  function insertRules(barbershopId: string, rules: BookingRulesProps) {
    return dataSource.query(
      `INSERT INTO barbershop_booking_rules (barbershop_id, minimum_advance_minutes, cancellation_deadline_minutes, no_show_limit, waitlist_offer_minutes, return_reminder_days)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        barbershopId,
        rules.minimumAdvanceMinutes,
        rules.cancellationDeadlineMinutes,
        rules.noShowLimit,
        rules.waitlistOfferMinutes,
        rules.returnReminderDays,
      ],
    );
  }

  async function snapshotOtherTables(): Promise<unknown[]> {
    return [
      await dataSource.query<unknown[]>(
        'SELECT * FROM barbershops ORDER BY id',
      ),
      await dataSource.query<unknown[]>(
        'SELECT * FROM barbershop_opening_hours ORDER BY barbershop_id, weekday',
      ),
    ];
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    repository = new TypeOrmBookingRulesRepository(dataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    barbershopA = await insertBarbershop('Barbearia A');
    barbershopB = await insertBarbershop('Barbearia B');
    await insertRules(barbershopA, RULES_A);
    await insertRules(barbershopB, RULES_B);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('RN-26: reads the rules of the given barbershop, never those of another one', async () => {
    expect(toPlain(await repository.findByBarbershopId(barbershopA))).toEqual(
      RULES_A,
    );
    expect(toPlain(await repository.findByBarbershopId(barbershopB))).toEqual(
      RULES_B,
    );
  });

  it('returns null for a barbershop without rules', async () => {
    const withoutRules = await insertBarbershop('Barbearia C');

    expect(await repository.findByBarbershopId(withoutRules)).toBeNull();
  });

  it('CA-06.2: after save, the next read returns the new rules', async () => {
    await repository.save(barbershopA, BookingRules.create(NEW_RULES));

    expect(toPlain(await repository.findByBarbershopId(barbershopA))).toEqual(
      NEW_RULES,
    );
  });

  it('CA-06.2: accepts and reads back 0 for minimum advance and cancellation deadline', async () => {
    const zeros = {
      ...NEW_RULES,
      minimumAdvanceMinutes: 0,
      cancellationDeadlineMinutes: 0,
    };

    await repository.save(barbershopA, BookingRules.create(zeros));

    expect(toPlain(await repository.findByBarbershopId(barbershopA))).toEqual(
      zeros,
    );
  });

  it('CA-06.2: save leaves the barbershop row and its opening hours untouched', async () => {
    const before = await snapshotOtherTables();

    await repository.save(barbershopA, BookingRules.create(NEW_RULES));

    expect(await snapshotOtherTables()).toEqual(before);
  });

  it('RN-26: saving the rules of A leaves the rules of B unchanged', async () => {
    await repository.save(barbershopA, BookingRules.create(NEW_RULES));

    expect(toPlain(await repository.findByBarbershopId(barbershopB))).toEqual(
      RULES_B,
    );
  });

  it('RN-26: saving the rules of B changes only B', async () => {
    await repository.save(barbershopB, BookingRules.create(NEW_RULES));

    expect(toPlain(await repository.findByBarbershopId(barbershopB))).toEqual(
      NEW_RULES,
    );
    expect(toPlain(await repository.findByBarbershopId(barbershopA))).toEqual(
      RULES_A,
    );
  });
});
