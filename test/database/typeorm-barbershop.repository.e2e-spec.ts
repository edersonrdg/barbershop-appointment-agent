import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Barbershop } from '../../src/domain/entities/barbershop';
import { User } from '../../src/domain/entities/user';
import { EmailAlreadyRegisteredError } from '../../src/domain/errors/email-already-registered.error';
import { BarbershopTimezone } from '../../src/domain/value-objects/barbershop-timezone';
import { BookingRules } from '../../src/domain/value-objects/booking-rules';
import { DayOpeningHours } from '../../src/domain/value-objects/day-opening-hours';
import { TimeOfDay } from '../../src/domain/value-objects/time-of-day';
import { Weekday } from '../../src/domain/value-objects/weekday';
import { WeeklyOpeningHours } from '../../src/domain/value-objects/weekly-opening-hours';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmBarbershopRepository } from '../../src/infrastructure/database/repositories/typeorm-barbershop.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const NOW = new Date('2026-09-27T12:00:00.000Z');

function buildBarbershop(name = 'Barbearia do Zé'): Barbershop {
  return Barbershop.startTrial({ id: randomUUID(), name, now: NOW });
}

function buildOwner(barbershopId: string, email: string): User {
  return User.createOwner({
    id: randomUUID(),
    barbershopId,
    name: 'José da Silva',
    email,
    phone: '+5511912345678',
    passwordHash: 'scrypt$16384$8$1$salt$hash',
    now: NOW,
  });
}

const t = (raw: string) => TimeOfDay.create(raw);

const ALL_CLOSED: Record<Weekday, null> = {
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

function mondayAndSaturday(): WeeklyOpeningHours {
  return WeeklyOpeningHours.create({
    ...ALL_CLOSED,
    monday: DayOpeningHours.create({
      weekday: 'monday',
      opensAt: t('09:00'),
      closesAt: t('19:00'),
      break: { startsAt: t('12:00'), endsAt: t('13:00') },
    }),
    saturday: DayOpeningHours.create({
      weekday: 'saturday',
      opensAt: t('08:30'),
      closesAt: t('14:00'),
    }),
  });
}

const MONDAY_AND_SATURDAY = {
  monday: {
    opensAt: '09:00',
    closesAt: '19:00',
    break: { startsAt: '12:00', endsAt: '13:00' },
  },
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: { opensAt: '08:30', closesAt: '14:00', break: null },
  sunday: null,
};

function describeWeek(barbershop: Barbershop | null) {
  const weekdays: Weekday[] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  return Object.fromEntries(
    weekdays.map((weekday) => {
      const day = barbershop?.openingHours.forDay(weekday);
      return [
        weekday,
        day
          ? {
              opensAt: day.opensAt.toString(),
              closesAt: day.closesAt.toString(),
              break: day.break
                ? {
                    startsAt: day.break.startsAt.toString(),
                    endsAt: day.break.endsAt.toString(),
                  }
                : null,
            }
          : null,
      ];
    }),
  );
}

async function countRows(
  dataSource: DataSource,
  table: 'barbershops' | 'users' | 'barbershop_booking_rules',
): Promise<number> {
  const rows = await dataSource.query<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM ${table}`,
  );
  return rows[0].count;
}

describe('TypeOrmBarbershopRepository (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmBarbershopRepository;

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    repository = new TypeOrmBarbershopRepository(dataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('CA-01.1: persists the barbershop and its owner and reads the barbershop back with every field', async () => {
    const barbershop = buildBarbershop();
    const owner = buildOwner(barbershop.id, 'dono@barbearia.com');

    await repository.createWithOwner(
      barbershop,
      owner,
      BookingRules.defaults(),
    );

    const found = await repository.findById(barbershop.id);
    expect(found).toBeInstanceOf(Barbershop);
    expect(found?.id).toBe(barbershop.id);
    expect(found?.name).toBe('Barbearia do Zé');
    expect(found?.timezone).toBe('America/Sao_Paulo');
    expect(found?.subscriptionStatus).toBe('trialing');
    expect(found?.trialEndsAt.toISOString()).toBe('2026-10-11T12:00:00.000Z');
    expect(found?.createdAt.toISOString()).toBe('2026-09-27T12:00:00.000Z');

    const users = await dataSource.query<
      Array<{
        id: string;
        barbershop_id: string;
        name: string;
        email: string;
        phone: string;
        password_hash: string;
        role: string;
        created_at: Date;
      }>
    >('SELECT * FROM users');
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(owner.id);
    expect(users[0].barbershop_id).toBe(barbershop.id);
    expect(users[0].name).toBe('José da Silva');
    expect(users[0].email).toBe('dono@barbearia.com');
    expect(users[0].phone).toBe('+5511912345678');
    expect(users[0].password_hash).toBe('scrypt$16384$8$1$salt$hash');
    expect(users[0].role).toBe('owner');
    expect(users[0].created_at.toISOString()).toBe('2026-09-27T12:00:00.000Z');
  });

  it('CA-06.1: createWithOwner writes the booking rules it receives for the new barbershop', async () => {
    const barbershop = buildBarbershop();

    await repository.createWithOwner(
      barbershop,
      buildOwner(barbershop.id, 'dono@barbearia.com'),
      BookingRules.defaults(),
    );

    const rows = await dataSource.query<
      Array<{
        barbershop_id: string;
        minimum_advance_minutes: number;
        cancellation_deadline_minutes: number;
        no_show_limit: number;
        waitlist_offer_minutes: number;
        return_reminder_days: number;
      }>
    >('SELECT * FROM barbershop_booking_rules');
    expect(rows).toEqual([
      {
        barbershop_id: barbershop.id,
        minimum_advance_minutes: 60,
        cancellation_deadline_minutes: 120,
        no_show_limit: 2,
        waitlist_offer_minutes: 15,
        return_reminder_days: 30,
      },
    ]);
  });

  it('CA-01.1: findById returns null for an unknown barbershop', async () => {
    expect(await repository.findById(randomUUID())).toBeNull();
  });

  it('CA-03.1: findById reads the address and the opening hours as HH:mm, with missing days closed', async () => {
    const barbershop = buildBarbershop();
    await repository.createWithOwner(
      barbershop,
      buildOwner(barbershop.id, 'dono@barbearia.com'),
      BookingRules.defaults(),
    );
    await dataSource.query(
      `UPDATE barbershops SET address = 'Rua das Flores, 123 - Centro, Campinas/SP', timezone = 'America/Manaus' WHERE id = $1`,
      [barbershop.id],
    );
    await dataSource.query(
      `INSERT INTO barbershop_opening_hours (barbershop_id, weekday, opens_at, closes_at, break_starts_at, break_ends_at)
       VALUES ($1, 1, '09:00', '19:00', '12:00', '13:00'), ($1, 6, '08:30', '14:00', NULL, NULL)`,
      [barbershop.id],
    );

    const found = await repository.findById(barbershop.id);

    expect(found?.address).toBe('Rua das Flores, 123 - Centro, Campinas/SP');
    expect(found?.timezone).toBe('America/Manaus');
    const monday = found?.openingHours.forDay('monday');
    expect(monday?.opensAt.toString()).toBe('09:00');
    expect(monday?.closesAt.toString()).toBe('19:00');
    expect(monday?.break?.startsAt.toString()).toBe('12:00');
    expect(monday?.break?.endsAt.toString()).toBe('13:00');
    const saturday = found?.openingHours.forDay('saturday');
    expect(saturday?.opensAt.toString()).toBe('08:30');
    expect(saturday?.closesAt.toString()).toBe('14:00');
    expect(saturday?.break).toBeNull();
    for (const weekday of [
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'sunday',
    ] as const) {
      expect(found?.openingHours.forDay(weekday)).toBeNull();
    }
  });

  it('CA-03.1: findById of a barbershop that never saved settings has no address and every day closed', async () => {
    const barbershop = buildBarbershop();
    await repository.createWithOwner(
      barbershop,
      buildOwner(barbershop.id, 'dono@barbearia.com'),
      BookingRules.defaults(),
    );

    const found = await repository.findById(barbershop.id);

    expect(found?.address).toBeNull();
    expect(found?.openIntervalsOn('2026-10-05')).toEqual([]);
  });

  it('CA-01.3: a repeated e-mail throws EmailAlreadyRegisteredError and the second barbershop is not persisted', async () => {
    const first = buildBarbershop('Primeira');
    await repository.createWithOwner(
      first,
      buildOwner(first.id, 'dono@barbearia.com'),
      BookingRules.defaults(),
    );
    const second = buildBarbershop('Segunda');

    await expect(
      repository.createWithOwner(
        second,
        buildOwner(second.id, 'dono@barbearia.com'),
        BookingRules.defaults(),
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);

    expect(await repository.findById(second.id)).toBeNull();
    expect(await countRows(dataSource, 'barbershops')).toBe(1);
    expect(await countRows(dataSource, 'users')).toBe(1);
    expect(await countRows(dataSource, 'barbershop_booking_rules')).toBe(1);
  });

  it('CA-01.3: two concurrent createWithOwner with the same e-mail yield one success, one EmailAlreadyRegisteredError and a single barbershop', async () => {
    const first = buildBarbershop('Primeira');
    const second = buildBarbershop('Segunda');

    const results = await Promise.allSettled([
      repository.createWithOwner(
        first,
        buildOwner(first.id, 'dono@barbearia.com'),
        BookingRules.defaults(),
      ),
      repository.createWithOwner(
        second,
        buildOwner(second.id, 'dono@barbearia.com'),
        BookingRules.defaults(),
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(await countRows(dataSource, 'barbershops')).toBe(1);
    expect(await countRows(dataSource, 'users')).toBe(1);
  });

  describe('saveSettings', () => {
    async function persistedBarbershop(
      name: string,
      email: string,
    ): Promise<Barbershop> {
      const barbershop = buildBarbershop(name);
      await repository.createWithOwner(
        barbershop,
        buildOwner(barbershop.id, email),
        BookingRules.defaults(),
      );
      return barbershop;
    }

    it('CA-03.1: saves name, address, timezone and week, and findById reads back the same state', async () => {
      const barbershop = await persistedBarbershop(
        'Barbearia do Zé',
        'dono@barbearia.com',
      );
      barbershop.updateSettings({
        name: 'Barbearia Nova',
        address: 'Rua das Flores, 123 - Centro, Campinas/SP',
        timezone: BarbershopTimezone.create('America/Manaus'),
        openingHours: mondayAndSaturday(),
      });

      await repository.saveSettings(barbershop);

      const found = await repository.findById(barbershop.id);
      expect(found?.name).toBe('Barbearia Nova');
      expect(found?.address).toBe('Rua das Flores, 123 - Centro, Campinas/SP');
      expect(found?.timezone).toBe('America/Manaus');
      expect(describeWeek(found)).toEqual(MONDAY_AND_SATURDAY);
    });

    it('CA-03.1: a day saved as closed after being open is read back as closed', async () => {
      const barbershop = await persistedBarbershop(
        'Barbearia do Zé',
        'dono@barbearia.com',
      );
      const settings = {
        name: 'Barbearia do Zé',
        address: 'Rua das Flores, 123 - Centro, Campinas/SP',
        timezone: BarbershopTimezone.create('America/Sao_Paulo'),
      };
      barbershop.updateSettings({
        ...settings,
        openingHours: mondayAndSaturday(),
      });
      await repository.saveSettings(barbershop);

      const saturdayOnly = WeeklyOpeningHours.create({
        ...ALL_CLOSED,
        saturday: mondayAndSaturday().forDay('saturday'),
      });
      barbershop.updateSettings({ ...settings, openingHours: saturdayOnly });
      await repository.saveSettings(barbershop);

      const found = await repository.findById(barbershop.id);
      expect(found?.openingHours.forDay('monday')).toBeNull();
      expect(found?.openingHours.forDay('saturday')?.opensAt.toString()).toBe(
        '08:30',
      );
    });

    it('RN-26: saving barbershop A leaves the name, address, timezone and days of barbershop B untouched', async () => {
      const a = await persistedBarbershop('Barbearia A', 'a@barbearia.com');
      const b = await persistedBarbershop('Barbearia B', 'b@barbearia.com');
      b.updateSettings({
        name: 'Barbearia B',
        address: 'Avenida B, 200 - Centro, Manaus/AM',
        timezone: BarbershopTimezone.create('America/Manaus'),
        openingHours: mondayAndSaturday(),
      });
      await repository.saveSettings(b);

      a.updateSettings({
        name: 'Barbearia A Nova',
        address: 'Rua A, 100 - Centro, Campinas/SP',
        timezone: BarbershopTimezone.create('America/Recife'),
        openingHours: WeeklyOpeningHours.create(ALL_CLOSED),
      });
      await repository.saveSettings(a);

      const foundB = await repository.findById(b.id);
      expect(foundB?.name).toBe('Barbearia B');
      expect(foundB?.address).toBe('Avenida B, 200 - Centro, Manaus/AM');
      expect(foundB?.timezone).toBe('America/Manaus');
      expect(describeWeek(foundB)).toEqual(describeWeek(b));
      expect((await repository.findById(a.id))?.name).toBe('Barbearia A Nova');
    });

    it('CA-03.2: a failure in the middle of the save (a day rejected by a CHECK) leaves everything unchanged', async () => {
      const barbershop = await persistedBarbershop(
        'Barbearia do Zé',
        'dono@barbearia.com',
      );
      barbershop.updateSettings({
        name: 'Barbearia do Zé',
        address: 'Rua das Flores, 123 - Centro, Campinas/SP',
        timezone: BarbershopTimezone.create('America/Sao_Paulo'),
        openingHours: mondayAndSaturday(),
      });
      await repository.saveSettings(barbershop);

      const valid = mondayAndSaturday();
      // Forges a day the domain would never build, to reach the database CHECK.
      const incoherentWeek = {
        forDay: (weekday: Weekday) =>
          weekday === 'tuesday'
            ? { opensAt: t('18:00'), closesAt: t('09:00'), break: null }
            : valid.forDay(weekday),
      } as unknown as WeeklyOpeningHours;
      barbershop.updateSettings({
        name: 'Nome Que Não Pode Ficar',
        address: 'Endereço que não pode ficar',
        timezone: BarbershopTimezone.create('America/Manaus'),
        openingHours: incoherentWeek,
      });

      await expect(repository.saveSettings(barbershop)).rejects.toMatchObject({
        driverError: { code: '23514' },
      });

      const found = await repository.findById(barbershop.id);
      expect(found?.name).toBe('Barbearia do Zé');
      expect(found?.address).toBe('Rua das Flores, 123 - Centro, Campinas/SP');
      expect(found?.timezone).toBe('America/Sao_Paulo');
      expect(describeWeek(found)).toEqual(MONDAY_AND_SATURDAY);
    });
  });
});
