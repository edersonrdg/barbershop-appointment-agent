import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Barber } from '../../src/domain/entities/barber';
import { BarbershopService } from '../../src/domain/entities/barbershop-service';
import { User } from '../../src/domain/entities/user';
import { BarberNameAlreadyExistsError } from '../../src/domain/errors/barber-name-already-exists.error';
import { BarberNotFoundError } from '../../src/domain/errors/barber-not-found.error';
import { BarberUserAlreadyLinkedError } from '../../src/domain/errors/barber-user-already-linked.error';
import { DayWorkingHours } from '../../src/domain/value-objects/day-working-hours';
import { ServiceDuration } from '../../src/domain/value-objects/service-duration';
import { ServicePrice } from '../../src/domain/value-objects/service-price';
import { TimeOfDay } from '../../src/domain/value-objects/time-of-day';
import { Weekday, WEEKDAYS } from '../../src/domain/value-objects/weekday';
import { WeeklyWorkingHours } from '../../src/domain/value-objects/weekly-working-hours';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmBarberRepository } from '../../src/infrastructure/database/repositories/typeorm-barber.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const t = (raw: string) => TimeOfDay.create(raw);

type DayInput = {
  from: string;
  to: string;
  break?: { from: string; to: string };
};

function workingHours(
  days: Partial<Record<Weekday, DayInput>>,
): WeeklyWorkingHours {
  return WeeklyWorkingHours.create(
    Object.fromEntries(
      WEEKDAYS.map((weekday) => {
        const day = days[weekday];
        return [
          weekday,
          day
            ? DayWorkingHours.create({
                weekday,
                startsAt: t(day.from),
                endsAt: t(day.to),
                break: day.break
                  ? { startsAt: t(day.break.from), endsAt: t(day.break.to) }
                  : null,
              })
            : null,
        ];
      }),
    ) as Record<Weekday, DayWorkingHours | null>,
  );
}

const FULL_WEEK = workingHours({
  monday: { from: '09:00', to: '18:00', break: { from: '12:00', to: '13:00' } },
  tuesday: { from: '09:00', to: '18:00' },
  wednesday: { from: '10:30', to: '19:45' },
  thursday: { from: '09:00', to: '18:00' },
  friday: { from: '09:00', to: '18:00' },
  saturday: { from: '08:00', to: '14:00' },
  sunday: { from: '09:00', to: '12:00' },
});

function describeHours(hours: WeeklyWorkingHours) {
  return Object.fromEntries(
    WEEKDAYS.map((weekday) => {
      const day = hours.forDay(weekday);
      return [
        weekday,
        day && {
          startsAt: day.startsAt.toString(),
          endsAt: day.endsAt.toString(),
          break: day.break && {
            startsAt: day.break.startsAt.toString(),
            endsAt: day.break.endsAt.toString(),
          },
        },
      ];
    }),
  );
}

function describeBarber(barber: Barber | null | undefined) {
  if (!barber) return barber;
  return {
    id: barber.id,
    barbershopId: barber.barbershopId,
    name: barber.name,
    active: barber.active,
    userId: barber.userId,
    serviceIds: [...barber.serviceIds],
    workingHours: describeHours(barber.workingHours),
    createdAt: barber.createdAt.toISOString(),
  };
}

describe('TypeOrmBarberRepository (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmBarberRepository;
  let barbershopA: string;
  let barbershopB: string;
  let haircutA: BarbershopService;
  let beardA: BarbershopService;
  let haircutB: BarbershopService;

  async function insertBarbershop(): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
       VALUES ($1, 'Barbearia', 'America/Sao_Paulo', 'trialing', now(), now())`,
      [id],
    );
    return id;
  }

  async function insertService(
    barbershopId: string,
    name: string,
  ): Promise<BarbershopService> {
    const service = BarbershopService.create({
      id: randomUUID(),
      barbershopId,
      name,
      price: ServicePrice.create(4500),
      duration: ServiceDuration.create(30),
      now: NOW,
    });
    await dataSource.query(
      `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, active, created_at)
       VALUES ($1, $2, $3, 4500, 30, true, now())`,
      [service.id, barbershopId, name],
    );
    return service;
  }

  async function insertUser(barbershopId: string): Promise<User> {
    const user = User.restore({
      id: randomUUID(),
      barbershopId,
      name: 'João Pereira',
      email: `${randomUUID()}@example.com`,
      phone: null,
      passwordHash: 'hash',
      role: 'barber',
      createdAt: NOW,
    });
    await dataSource.query(
      `INSERT INTO users (id, barbershop_id, name, email, phone, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, NULL, 'hash', 'barber', now())`,
      [user.id, barbershopId, user.name, user.email],
    );
    return user;
  }

  function buildBarber(
    name: string,
    {
      barbershopId = barbershopA,
      services = [haircutA],
      user = null as User | null,
      hours = FULL_WEEK,
    } = {},
  ): Barber {
    const barber = Barber.create({
      id: randomUUID(),
      barbershopId,
      name,
      workingHours: hours,
      now: NOW,
    });
    barber.changeServices(services);
    barber.linkUser(user);
    return barber;
  }

  async function persisted(
    name: string,
    options: Parameters<typeof buildBarber>[1] = {},
  ): Promise<Barber> {
    const barber = buildBarber(name, options);
    await repository.create(barber);
    return barber;
  }

  async function countRows(
    table: 'barbers' | 'barber_services' | 'barber_working_hours',
  ): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM ${table}`,
    );
    return Number(row.count);
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    repository = new TypeOrmBarberRepository(dataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    barbershopA = await insertBarbershop();
    barbershopB = await insertBarbershop();
    haircutA = await insertService(barbershopA, 'Corte');
    beardA = await insertService(barbershopA, 'Barba');
    haircutB = await insertService(barbershopB, 'Corte');
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('CA-05.1: create persists every field and findById reads back the services in order and the 7 days', async () => {
    const user = await insertUser(barbershopA);
    const barber = buildBarber('João', { services: [beardA, haircutA], user });

    await repository.create(barber);

    expect(
      describeBarber(await repository.findById(barbershopA, barber.id)),
    ).toEqual({
      id: barber.id,
      barbershopId: barbershopA,
      name: 'João',
      active: true,
      userId: user.id,
      serviceIds: [beardA.id, haircutA.id],
      workingHours: describeHours(FULL_WEEK),
      createdAt: '2026-09-28T12:00:00.000Z',
    });
  });

  it('CA-05.1: days off are read back as null and a barber without user has userId null', async () => {
    const hours = workingHours({ tuesday: { from: '09:00', to: '18:00' } });
    const barber = await persisted('Pedro', { hours });

    const found = await repository.findById(barbershopA, barber.id);

    expect(found?.userId).toBeNull();
    expect(describeHours(found!.workingHours)).toEqual({
      monday: null,
      tuesday: { startsAt: '09:00', endsAt: '18:00', break: null },
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    });
  });

  describe('lists', () => {
    it('CA-05.1: listByBarbershop returns active and inactive barbers by case-insensitive name, only of the barbershop', async () => {
      const joao = await persisted('João');
      const ana = await persisted('ana');
      const pedro = await persisted('Pedro');
      pedro.deactivate();
      await repository.save(pedro);
      await persisted('Bruno', {
        barbershopId: barbershopB,
        services: [haircutB],
      });

      const listed = await repository.listByBarbershop(barbershopA);

      expect(
        listed.map((barber) => [barber.id, barber.name, barber.active]),
      ).toEqual([
        [ana.id, 'ana', true],
        [joao.id, 'João', true],
        [pedro.id, 'Pedro', false],
      ]);
    });

    it('CA-05.1: listActiveByBarbershop leaves out inactive barbers and barbers of another barbershop, with services and hours', async () => {
      await persisted('João', { services: [haircutA, beardA] });
      const pedro = await persisted('Pedro');
      pedro.deactivate();
      await repository.save(pedro);
      await persisted('Bruno', {
        barbershopId: barbershopB,
        services: [haircutB],
      });

      const listed = await repository.listActiveByBarbershop(barbershopA);

      expect(listed.map(describeBarber)).toEqual([
        expect.objectContaining({
          name: 'João',
          serviceIds: [haircutA.id, beardA.id],
          workingHours: describeHours(FULL_WEEK),
        }),
      ]);
    });

    it('CA-05.1: a barbershop without barbers lists nothing', async () => {
      await persisted('Bruno', {
        barbershopId: barbershopB,
        services: [haircutB],
      });

      expect(await repository.listByBarbershop(barbershopA)).toEqual([]);
      expect(await repository.listActiveByBarbershop(barbershopA)).toEqual([]);
    });
  });

  describe('CA-05.2: findByUserId', () => {
    it('returns the barber linked to the user', async () => {
      const user = await insertUser(barbershopA);
      const barber = await persisted('João', { user });

      expect((await repository.findByUserId(barbershopA, user.id))?.id).toBe(
        barber.id,
      );
    });

    it('returns null for a user without barber and for another barbershop', async () => {
      const linked = await insertUser(barbershopA);
      const unlinked = await insertUser(barbershopA);
      await persisted('João', { user: linked });

      expect(
        await repository.findByUserId(barbershopA, unlinked.id),
      ).toBeNull();
      expect(await repository.findByUserId(barbershopB, linked.id)).toBeNull();
    });
  });

  it('RN-26: findById does not return a barber of another barbershop', async () => {
    const foreign = await persisted('Bruno', {
      barbershopId: barbershopB,
      services: [haircutB],
    });

    expect(await repository.findById(barbershopA, foreign.id)).toBeNull();
    expect(await repository.findById(barbershopA, randomUUID())).toBeNull();
  });

  describe('uniqueness', () => {
    it('CA-05.1: create with a name taken in another case throws BarberNameAlreadyExistsError and persists nothing', async () => {
      await persisted('João');

      await expect(
        repository.create(buildBarber('JOÃO')),
      ).rejects.toBeInstanceOf(BarberNameAlreadyExistsError);

      expect(await countRows('barbers')).toBe(1);
      expect(await countRows('barber_services')).toBe(1);
      expect(await countRows('barber_working_hours')).toBe(7);
    });

    it('CA-05.2: create with a user linked to another barber throws BarberUserAlreadyLinkedError and persists nothing', async () => {
      const user = await insertUser(barbershopA);
      await persisted('João', { user });

      await expect(
        repository.create(buildBarber('Pedro', { user })),
      ).rejects.toBeInstanceOf(BarberUserAlreadyLinkedError);

      expect(await countRows('barbers')).toBe(1);
      expect(await countRows('barber_services')).toBe(1);
      expect(await countRows('barber_working_hours')).toBe(7);
    });

    it('CA-05.2: save linking a user of another barber throws BarberUserAlreadyLinkedError and changes nothing', async () => {
      const user = await insertUser(barbershopA);
      await persisted('João', { user });
      const pedro = await persisted('Pedro');
      const before = describeBarber(
        await repository.findById(barbershopA, pedro.id),
      );

      pedro.update({ name: 'Pedro Santos', workingHours: workingHours({}) });
      pedro.linkUser(user);
      await expect(repository.save(pedro)).rejects.toBeInstanceOf(
        BarberUserAlreadyLinkedError,
      );

      expect(
        describeBarber(await repository.findById(barbershopA, pedro.id)),
      ).toEqual(before);
    });

    it('CA-05.1: save keeping its own name and user is accepted', async () => {
      const user = await insertUser(barbershopA);
      const joao = await persisted('João', { user });

      joao.update({ name: 'JOÃO', workingHours: FULL_WEEK });
      await repository.save(joao);

      expect((await repository.findById(barbershopA, joao.id))?.name).toBe(
        'JOÃO',
      );
    });
  });

  describe('save', () => {
    it('CA-05.1: replaces name, user, active, services and working hours', async () => {
      const user = await insertUser(barbershopA);
      const barber = await persisted('João', { user });

      barber.update({
        name: 'João Silva',
        workingHours: workingHours({
          friday: { from: '14:00', to: '22:00' },
        }),
      });
      barber.changeServices([beardA]);
      barber.linkUser(null);
      barber.deactivate();
      await repository.save(barber);

      expect(
        describeBarber(await repository.findById(barbershopA, barber.id)),
      ).toEqual({
        id: barber.id,
        barbershopId: barbershopA,
        name: 'João Silva',
        active: false,
        userId: null,
        serviceIds: [beardA.id],
        workingHours: describeHours(
          workingHours({ friday: { from: '14:00', to: '22:00' } }),
        ),
        createdAt: '2026-09-28T12:00:00.000Z',
      });
      expect(await countRows('barber_services')).toBe(1);
      expect(await countRows('barber_working_hours')).toBe(1);
    });

    it('RN-26: a forged barber carrying the id of another barbershop throws BarberNotFoundError and its services and hours stay', async () => {
      const foreign = await persisted('Bruno', {
        barbershopId: barbershopB,
        services: [haircutB],
      });
      const before = describeBarber(
        await repository.findById(barbershopB, foreign.id),
      );
      const forged = Barber.restore({
        id: foreign.id,
        barbershopId: barbershopA,
        name: 'Forjado',
        active: true,
        userId: null,
        serviceIds: [haircutA.id],
        workingHours: workingHours({}),
        createdAt: NOW,
      });

      await expect(repository.save(forged)).rejects.toBeInstanceOf(
        BarberNotFoundError,
      );

      expect(
        describeBarber(await repository.findById(barbershopB, foreign.id)),
      ).toEqual(before);
      expect(await countRows('barber_working_hours')).toBe(7);
    });
  });
});
