import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { BarbershopService } from '../../../domain/entities/barbershop-service';
import { ServiceNameAlreadyExistsError } from '../../../domain/errors/service-name-already-exists.error';
import { ServiceNotFoundError } from '../../../domain/errors/service-not-found.error';
import { ServiceDuration } from '../../../domain/value-objects/service-duration';
import { ServicePrice } from '../../../domain/value-objects/service-price';
import { ServiceRepository } from '../../../usecases/ports/service.repository.port';
import { ServiceAddOnEntity } from '../entities/service-add-on.entity';
import { ServiceEntity } from '../entities/service.entity';

const UNIQUE_VIOLATION = '23505';
const SERVICES_NAME_UNIQUE = 'services_name_unique';

export class TypeOrmServiceRepository implements ServiceRepository {
  constructor(private readonly dataSource: DataSource) {}

  listByBarbershop(barbershopId: string): Promise<BarbershopService[]> {
    return this.list(barbershopId, false);
  }

  listActiveByBarbershop(barbershopId: string): Promise<BarbershopService[]> {
    return this.list(barbershopId, true);
  }

  async findById(
    barbershopId: string,
    serviceId: string,
  ): Promise<BarbershopService | null> {
    const [found] = await this.findByIds(barbershopId, [serviceId]);
    return found ?? null;
  }

  async findByIds(
    barbershopId: string,
    serviceIds: readonly string[],
  ): Promise<BarbershopService[]> {
    if (serviceIds.length === 0) return [];
    const rows = await this.dataSource
      .getRepository(ServiceEntity)
      .findBy({ barbershopId, id: In([...serviceIds]) });
    return this.toDomain(rows);
  }

  async create(service: BarbershopService): Promise<void> {
    await this.writeWithNameGuard(async (manager) => {
      await manager.insert(ServiceEntity, {
        id: service.id,
        barbershopId: service.barbershopId,
        name: service.name,
        priceCents: service.priceCents,
        durationMinutes: service.durationMinutes,
        active: service.active,
        createdAt: service.createdAt,
      });
      await insertAddOns(manager, service);
    });
  }

  async save(service: BarbershopService): Promise<void> {
    await this.writeWithNameGuard(async (manager) => {
      const { affected } = await manager.update(
        ServiceEntity,
        { id: service.id, barbershopId: service.barbershopId },
        {
          name: service.name,
          priceCents: service.priceCents,
          durationMinutes: service.durationMinutes,
          active: service.active,
        },
      );
      // RN-26: the add-ons are keyed only by service_id, so they are replaced
      // only after the service row of this tenant was matched.
      if (affected !== 1) {
        throw new ServiceNotFoundError();
      }
      await manager.delete(ServiceAddOnEntity, { serviceId: service.id });
      await insertAddOns(manager, service);
    });
  }

  private async list(
    barbershopId: string,
    onlyActive: boolean,
  ): Promise<BarbershopService[]> {
    const query = this.dataSource
      .getRepository(ServiceEntity)
      .createQueryBuilder('service')
      .where('service.barbershop_id = :barbershopId', { barbershopId });
    if (onlyActive) {
      query.andWhere('service.active = true');
    }
    const rows = await query.orderBy('LOWER(service.name)', 'ASC').getMany();
    return this.toDomain(rows);
  }

  private async toDomain(rows: ServiceEntity[]): Promise<BarbershopService[]> {
    if (rows.length === 0) return [];
    const addOnRows = await this.dataSource
      .getRepository(ServiceAddOnEntity)
      .find({
        where: { serviceId: In(rows.map((row) => row.id)) },
        order: { position: 'ASC' },
      });
    return rows.map((row) =>
      BarbershopService.restore({
        id: row.id,
        barbershopId: row.barbershopId,
        name: row.name,
        price: ServicePrice.create(row.priceCents),
        duration: ServiceDuration.create(row.durationMinutes),
        active: row.active,
        suggestedAddOnIds: addOnRows
          .filter((addOn) => addOn.serviceId === row.id)
          .map((addOn) => addOn.addOnServiceId),
        createdAt: row.createdAt,
      }),
    );
  }

  private async writeWithNameGuard(
    write: (manager: EntityManager) => Promise<void>,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(write);
    } catch (error) {
      if (isServiceNameUniqueViolation(error)) {
        throw new ServiceNameAlreadyExistsError();
      }
      throw error;
    }
  }
}

async function insertAddOns(
  manager: EntityManager,
  service: BarbershopService,
): Promise<void> {
  if (service.suggestedAddOnIds.length === 0) return;
  await manager.insert(
    ServiceAddOnEntity,
    service.suggestedAddOnIds.map((addOnServiceId, position) => ({
      serviceId: service.id,
      addOnServiceId,
      position,
    })),
  );
}

function isServiceNameUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError: unknown = error.driverError;
  if (typeof driverError !== 'object' || driverError === null) return false;
  return (
    'code' in driverError &&
    driverError.code === UNIQUE_VIOLATION &&
    'constraint' in driverError &&
    driverError.constraint === SERVICES_NAME_UNIQUE
  );
}
