import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { BarbershopService } from '../../src/domain/entities/barbershop-service';
import { ServiceNameAlreadyExistsError } from '../../src/domain/errors/service-name-already-exists.error';
import { ServiceNotFoundError } from '../../src/domain/errors/service-not-found.error';
import { ServiceDuration } from '../../src/domain/value-objects/service-duration';
import { ServicePrice } from '../../src/domain/value-objects/service-price';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmServiceRepository } from '../../src/infrastructure/database/repositories/typeorm-service.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { truncateAccountTables } from '../support/truncate-account-tables';

const NOW = new Date('2026-09-27T12:00:00.000Z');

function describeService(service: BarbershopService | null | undefined) {
  if (!service) return service;
  return {
    id: service.id,
    barbershopId: service.barbershopId,
    name: service.name,
    priceCents: service.priceCents,
    durationMinutes: service.durationMinutes,
    active: service.active,
    suggestedAddOnIds: [...service.suggestedAddOnIds],
    createdAt: service.createdAt.toISOString(),
  };
}

describe('TypeOrmServiceRepository (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmServiceRepository;
  let barbershopA: string;
  let barbershopB: string;

  async function insertBarbershop(): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
       VALUES ($1, 'Barbearia', 'America/Sao_Paulo', 'trialing', now(), now())`,
      [id],
    );
    return id;
  }

  function buildService(
    name: string,
    barbershopId = barbershopA,
    priceCents = 4500,
    durationMinutes = 30,
  ): BarbershopService {
    return BarbershopService.create({
      id: randomUUID(),
      barbershopId,
      name,
      price: ServicePrice.create(priceCents),
      duration: ServiceDuration.create(durationMinutes),
      now: NOW,
    });
  }

  async function persisted(
    name: string,
    barbershopId = barbershopA,
  ): Promise<BarbershopService> {
    const service = buildService(name, barbershopId);
    await repository.create(service);
    return service;
  }

  async function countRows(
    table: 'services' | 'service_add_ons',
  ): Promise<number> {
    const [row] = await dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM ${table}`,
    );
    return Number(row.count);
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    repository = new TypeOrmServiceRepository(dataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    barbershopA = await insertBarbershop();
    barbershopB = await insertBarbershop();
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('CA-04.1: create persists every field and findById reads it back with the add-ons in order', async () => {
    const beard = await persisted('Barba');
    const brows = await persisted('Sobrancelha');
    const haircut = buildService('Corte', barbershopA, 0, 480);
    haircut.changeSuggestedAddOns([brows, beard]);

    await repository.create(haircut);

    expect(
      describeService(await repository.findById(barbershopA, haircut.id)),
    ).toEqual({
      id: haircut.id,
      barbershopId: barbershopA,
      name: 'Corte',
      priceCents: 0,
      durationMinutes: 480,
      active: true,
      suggestedAddOnIds: [brows.id, beard.id],
      createdAt: '2026-09-27T12:00:00.000Z',
    });
  });

  describe('lists', () => {
    it('CA-04.1: listByBarbershop returns active and inactive services by case-insensitive name, only of the barbershop', async () => {
      const haircut = await persisted('Corte');
      const beard = await persisted('barba');
      const brows = await persisted('Sobrancelha');
      brows.deactivate();
      await repository.save(brows);
      await persisted('Alisamento', barbershopB);

      const listed = await repository.listByBarbershop(barbershopA);

      expect(listed.map((service) => [service.name, service.active])).toEqual([
        ['barba', true],
        ['Corte', true],
        ['Sobrancelha', false],
      ]);
      expect(listed.map((service) => service.id)).toEqual([
        beard.id,
        haircut.id,
        brows.id,
      ]);
    });

    it('CA-04.3: listActiveByBarbershop leaves out inactive services and services of another barbershop', async () => {
      await persisted('Corte');
      await persisted('barba');
      const brows = await persisted('Sobrancelha');
      brows.deactivate();
      await repository.save(brows);
      await persisted('Alisamento', barbershopB);

      const listed = await repository.listActiveByBarbershop(barbershopA);

      expect(
        listed.map((service) => ({
          name: service.name,
          priceCents: service.priceCents,
          durationMinutes: service.durationMinutes,
        })),
      ).toEqual([
        { name: 'barba', priceCents: 4500, durationMinutes: 30 },
        { name: 'Corte', priceCents: 4500, durationMinutes: 30 },
      ]);
    });

    it('CA-04.1: a barbershop without services lists nothing', async () => {
      await persisted('Corte', barbershopB);

      expect(await repository.listByBarbershop(barbershopA)).toEqual([]);
      expect(await repository.listActiveByBarbershop(barbershopA)).toEqual([]);
    });
  });

  it('RN-26: findById and findByIds do not return a service of another barbershop', async () => {
    const own = await persisted('Corte');
    const foreign = await persisted('Barba', barbershopB);

    expect(await repository.findById(barbershopA, foreign.id)).toBeNull();
    expect(await repository.findById(barbershopA, randomUUID())).toBeNull();
    const found = await repository.findByIds(barbershopA, [
      own.id,
      foreign.id,
      randomUUID(),
    ]);
    expect(found.map((service) => service.id)).toEqual([own.id]);
  });

  describe('save', () => {
    it('CA-04.1: replaces name, price and duration', async () => {
      const service = await persisted('Corte');
      service.update({
        name: 'Corte Degradê',
        price: ServicePrice.create(5000),
        duration: ServiceDuration.create(45),
      });

      await repository.save(service);

      expect(
        describeService(await repository.findById(barbershopA, service.id)),
      ).toEqual({
        id: service.id,
        barbershopId: barbershopA,
        name: 'Corte Degradê',
        priceCents: 5000,
        durationMinutes: 45,
        active: true,
        suggestedAddOnIds: [],
        createdAt: '2026-09-27T12:00:00.000Z',
      });
    });

    it('CA-04.2: replaces the add-on list, including with an empty one', async () => {
      const beard = await persisted('Barba');
      const brows = await persisted('Sobrancelha');
      const haircut = buildService('Corte');
      haircut.changeSuggestedAddOns([beard]);
      await repository.create(haircut);

      haircut.changeSuggestedAddOns([brows]);
      await repository.save(haircut);
      expect(
        (await repository.findById(barbershopA, haircut.id))?.suggestedAddOnIds,
      ).toEqual([brows.id]);

      haircut.changeSuggestedAddOns([]);
      await repository.save(haircut);
      expect(
        (await repository.findById(barbershopA, haircut.id))?.suggestedAddOnIds,
      ).toEqual([]);
    });

    it('CA-04.3: deactivating keeps name, price, duration, its add-ons and the relations where it is an add-on', async () => {
      const beard = await persisted('Barba');
      const brows = buildService('Sobrancelha');
      brows.changeSuggestedAddOns([beard]);
      await repository.create(brows);
      const haircut = buildService('Corte');
      haircut.changeSuggestedAddOns([brows]);
      await repository.create(haircut);
      const before = describeService(
        await repository.findById(barbershopA, brows.id),
      );

      brows.deactivate();
      await repository.save(brows);

      expect(
        describeService(await repository.findById(barbershopA, brows.id)),
      ).toEqual({ ...before, active: false });
      expect(
        (await repository.findById(barbershopA, haircut.id))?.suggestedAddOnIds,
      ).toEqual([brows.id]);
    });

    it('RN-26: saving a service of barbershop A leaves the services of B untouched', async () => {
      const a = await persisted('Corte');
      const b = await persisted('Corte', barbershopB);
      const bBefore = describeService(
        await repository.findById(barbershopB, b.id),
      );

      a.update({
        name: 'Corte Novo',
        price: ServicePrice.create(9000),
        duration: ServiceDuration.create(60),
      });
      a.deactivate();
      await repository.save(a);

      expect(
        describeService(await repository.findById(barbershopB, b.id)),
      ).toEqual(bBefore);
    });
  });

  it('RN-26: save of an entity carrying the id of a service of B and the barbershop of A throws ServiceNotFoundError and B stays the same', async () => {
    const beardB = await persisted('Barba', barbershopB);
    const haircutB = buildService('Corte', barbershopB);
    haircutB.changeSuggestedAddOns([beardB]);
    await repository.create(haircutB);
    const before = describeService(
      await repository.findById(barbershopB, haircutB.id),
    );
    const forged = BarbershopService.restore({
      id: haircutB.id,
      barbershopId: barbershopA,
      name: 'Tomado',
      price: ServicePrice.create(1),
      duration: ServiceDuration.create(5),
      active: false,
      suggestedAddOnIds: [],
      createdAt: NOW,
    });

    await expect(repository.save(forged)).rejects.toBeInstanceOf(
      ServiceNotFoundError,
    );

    expect(
      describeService(await repository.findById(barbershopB, haircutB.id)),
    ).toEqual(before);
    expect(before?.suggestedAddOnIds).toEqual([beardB.id]);
  });

  describe('CA-04.1: repeated names', () => {
    it('create with a name that differs only in case throws ServiceNameAlreadyExistsError and persists nothing', async () => {
      const beard = await persisted('Barba');
      await persisted('Corte');
      const before = await countRows('services');
      const duplicate = buildService('CORTE');
      duplicate.changeSuggestedAddOns([beard]);

      await expect(repository.create(duplicate)).rejects.toBeInstanceOf(
        ServiceNameAlreadyExistsError,
      );

      expect(await countRows('services')).toBe(before);
      expect(await countRows('service_add_ons')).toBe(0);
    });

    it('save with the name of another service throws ServiceNameAlreadyExistsError and changes nothing', async () => {
      await persisted('Corte');
      const beard = await persisted('Barba');
      const brows = await persisted('Sobrancelha');
      const before = describeService(
        await repository.findById(barbershopA, beard.id),
      );
      beard.update({
        name: 'corte',
        price: ServicePrice.create(9000),
        duration: ServiceDuration.create(60),
      });
      beard.changeSuggestedAddOns([brows]);

      await expect(repository.save(beard)).rejects.toBeInstanceOf(
        ServiceNameAlreadyExistsError,
      );

      expect(
        describeService(await repository.findById(barbershopA, beard.id)),
      ).toEqual(before);
    });

    it('save keeping its own name with another case is accepted', async () => {
      const service = await persisted('Corte');
      service.update({
        name: 'CORTE',
        price: ServicePrice.create(4500),
        duration: ServiceDuration.create(30),
      });

      await repository.save(service);

      expect((await repository.findById(barbershopA, service.id))?.name).toBe(
        'CORTE',
      );
    });

    it('two concurrent creates with the same name yield one success and one ServiceNameAlreadyExistsError', async () => {
      const results = await Promise.allSettled([
        repository.create(buildService('Corte')),
        repository.create(buildService('corte')),
      ]);

      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ServiceNameAlreadyExistsError);
      expect(await countRows('services')).toBe(1);
    });
  });
});
