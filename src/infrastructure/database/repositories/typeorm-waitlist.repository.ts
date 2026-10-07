import { DataSource } from 'typeorm';
import { WaitlistEntry } from '../../../domain/entities/waitlist-entry';
import {
  WaitlistOffer,
  WaitlistRepository,
} from '../../../usecases/ports/waitlist.repository.port';
import { WaitlistEntryServiceEntity } from '../entities/waitlist-entry-service.entity';
import { WaitlistEntryEntity } from '../entities/waitlist-entry.entity';
import { WaitlistOfferEntity } from '../entities/waitlist-offer.entity';

// The Postgres driver of TypeORM answers an UPDATE with the returned rows and
// the affected count.
type Updated<T> = [T[], number];

// US-24 (door 1): every query carries the barbershop (RN-26).
export class TypeOrmWaitlistRepository implements WaitlistRepository {
  constructor(private readonly dataSource: DataSource) {}

  // A new entry replaces the client's previous one, with its offers.
  async join(entry: WaitlistEntry): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(WaitlistEntryEntity, {
        barbershopId: entry.barbershopId,
        clientId: entry.clientId,
      });
      await manager.insert(WaitlistEntryEntity, {
        id: entry.id,
        barbershopId: entry.barbershopId,
        clientId: entry.clientId,
        barberId: entry.barberId,
        startsOn: entry.startsOn,
        endsOn: entry.endsOn,
        period: entry.period,
        createdAt: entry.createdAt,
      });
      await manager.insert(
        WaitlistEntryServiceEntity,
        entry.serviceIds.map((serviceId, position) => ({
          entryId: entry.id,
          position,
          serviceId,
          barbershopId: entry.barbershopId,
        })),
      );
    });
  }

  async listEntries(barbershopId: string): Promise<WaitlistEntry[]> {
    const rows = await this.dataSource.getRepository(WaitlistEntryEntity).find({
      where: { barbershopId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    if (rows.length === 0) return [];
    const services = await this.dataSource
      .getRepository(WaitlistEntryServiceEntity)
      .find({ where: { barbershopId }, order: { position: 'ASC' } });
    return rows.map((row) =>
      WaitlistEntry.create({
        id: row.id,
        barbershopId: row.barbershopId,
        clientId: row.clientId,
        serviceIds: services
          .filter((service) => service.entryId === row.id)
          .map((service) => service.serviceId),
        barberId: row.barberId,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        period: row.period,
        createdAt: row.createdAt,
      }),
    );
  }

  async removeEntry(barbershopId: string, entryId: string): Promise<void> {
    await this.dataSource
      .getRepository(WaitlistEntryEntity)
      .delete({ barbershopId, id: entryId });
  }

  async removeClientEntry(
    barbershopId: string,
    clientId: string,
  ): Promise<boolean> {
    const result = await this.dataSource
      .getRepository(WaitlistEntryEntity)
      .delete({ barbershopId, clientId });
    return (result.affected ?? 0) > 0;
  }

  async listOffers(barbershopId: string): Promise<WaitlistOffer[]> {
    const rows = await this.dataSource
      .getRepository(WaitlistOfferEntity)
      .find({ where: { barbershopId } });
    return rows.map(toOffer);
  }

  async findOffer(
    barbershopId: string,
    offerId: string,
  ): Promise<WaitlistOffer | null> {
    const row = await this.dataSource
      .getRepository(WaitlistOfferEntity)
      .findOneBy({ barbershopId, id: offerId });
    return row ? toOffer(row) : null;
  }

  // RN-15: the partial unique indexes refuse a second pending offer of the
  // slot or of the entry, so of two concurrent runs only one inserts.
  async createOffer(offer: WaitlistOffer): Promise<boolean> {
    const rows = await this.dataSource.query<unknown[]>(
      `INSERT INTO waitlist_offers
         (id, barbershop_id, entry_id, appointment_id, barber_id, starts_at,
          expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        offer.id,
        offer.barbershopId,
        offer.entryId,
        offer.appointmentId,
        offer.barberId,
        offer.startsAt,
        offer.expiresAt,
        offer.status,
      ],
    );
    return rows.length === 1;
  }

  async expireOffers(barbershopId: string, now: Date): Promise<number> {
    const [rows] = await this.dataSource.query<Updated<unknown>>(
      `UPDATE waitlist_offers SET status = 'expired'
        WHERE barbershop_id = $1 AND status = 'pending' AND expires_at <= $2
        RETURNING id`,
      [barbershopId, now],
    );
    return rows.length;
  }

  async resolveOffer(
    barbershopId: string,
    offerId: string,
    status: 'accepted' | 'declined',
    now: Date,
  ): Promise<boolean> {
    const deadline = status === 'accepted' ? 'AND expires_at > $4' : '';
    const [rows] = await this.dataSource.query<Updated<unknown>>(
      `UPDATE waitlist_offers SET status = $3
        WHERE barbershop_id = $1 AND id = $2 AND status = 'pending' ${deadline}
        RETURNING id`,
      status === 'accepted'
        ? [barbershopId, offerId, status, now]
        : [barbershopId, offerId, status],
    );
    return rows.length === 1;
  }
}

function toOffer(row: WaitlistOfferEntity): WaitlistOffer {
  return {
    id: row.id,
    barbershopId: row.barbershopId,
    entryId: row.entryId,
    appointmentId: row.appointmentId,
    barberId: row.barberId,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    status: row.status,
  };
}
