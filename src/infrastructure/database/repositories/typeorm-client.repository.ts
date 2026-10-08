import { DataSource } from 'typeorm';
import { Client } from '../../../domain/entities/client';
import {
  ClientRepository,
  ClientSearch,
  ReturnReminderChange,
} from '../../../usecases/ports/client.repository.port';
import { ClientEntity } from '../entities/client.entity';
import { ReturnReminderConsentEntity } from '../entities/return-reminder-consent.entity';

interface ClientRow {
  id: string;
  barbershop_id: string;
  name: string;
  phone: string;
  created_at: Date;
  return_reminder_enabled: boolean;
  return_reminder_asked_at: Date | null;
}

export class TypeOrmClientRepository implements ClientRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findByPhone(
    barbershopId: string,
    phone: string,
  ): Promise<Client | null> {
    const row = await this.dataSource
      .getRepository(ClientEntity)
      .findOneBy({ barbershopId, phone });
    return row ? toClient(row) : null;
  }

  async findById(
    barbershopId: string,
    clientId: string,
  ): Promise<Client | null> {
    const row = await this.dataSource
      .getRepository(ClientEntity)
      .findOneBy({ barbershopId, id: clientId });
    return row ? toClient(row) : null;
  }

  // The barber filter joins on barbershop_id too, so an appointment of another
  // barbershop never links a client (RN-26).
  async search(barbershopId: string, search: ClientSearch): Promise<Client[]> {
    const rows = await this.dataSource.query<ClientRow[]>(
      `SELECT c.id, c.barbershop_id, c.name, c.phone, c.created_at,
              c.return_reminder_enabled, c.return_reminder_asked_at
         FROM clients c
        WHERE c.barbershop_id = $1
          AND (($2::text IS NULL AND $3::text IS NULL)
               OR c.name ILIKE '%' || $2::text || '%' ESCAPE '\\'
               OR c.phone LIKE '%' || $3::text || '%')
          AND ($4::uuid IS NULL OR EXISTS (
                SELECT 1
                  FROM appointments a
                 WHERE a.barbershop_id = c.barbershop_id
                   AND a.client_id = c.id
                   AND a.barber_id = $4::uuid))
        ORDER BY lower(c.name), c.id
        LIMIT $5`,
      [
        barbershopId,
        search.name === null ? null : escapeLikePattern(search.name),
        search.phoneDigits,
        search.barberId,
        search.limit,
      ],
    );
    return rows.map((row) =>
      toClient({
        id: row.id,
        barbershopId: row.barbershop_id,
        name: row.name,
        phone: row.phone,
        createdAt: row.created_at,
        returnReminderEnabled: row.return_reminder_enabled,
        returnReminderAskedAt: row.return_reminder_asked_at,
      }),
    );
  }

  // The unique (barbershop_id, phone) constraint settles two first messages
  // arriving at once: the second insert does nothing (RN-08).
  async createIfAbsent(client: Client): Promise<boolean> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at,
                            return_reminder_enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT clients_barbershop_phone_unique DO NOTHING
       RETURNING id`,
      [
        client.id,
        client.barbershopId,
        client.name,
        client.phone,
        client.createdAt,
        client.returnReminderEnabled,
      ],
    );
    return rows.length === 1;
  }

  async claimPrivacyNotice(client: Client, sentAt: Date): Promise<boolean> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(ClientEntity)
      .set({ privacyNoticeSentAt: sentAt })
      .where(
        'barbershop_id = :barbershopId AND id = :id AND privacy_notice_sent_at IS NULL',
        { barbershopId: client.barbershopId, id: client.id },
      )
      .execute();
    return result.affected === 1;
  }

  // CA-25.5: the consent row is written only by the UPDATE that changed the
  // value; a concurrent equal change waits on the row lock and then matches
  // nothing, so it records nothing.
  async changeReturnReminder(change: ReturnReminderChange): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const [, affected] = await manager.query<[unknown, number]>(
        `UPDATE clients SET return_reminder_enabled = $3
         WHERE barbershop_id = $1 AND id = $2
           AND return_reminder_enabled <> $3`,
        [change.barbershopId, change.clientId, change.enabled],
      );
      if (affected !== 1) return false;
      await manager.getRepository(ReturnReminderConsentEntity).insert({
        id: change.id,
        barbershopId: change.barbershopId,
        clientId: change.clientId,
        enabled: change.enabled,
        channel: change.channel,
        recordedAt: change.recordedAt,
      });
      return true;
    });
  }

  async claimReturnReminderQuestion(
    barbershopId: string,
    clientId: string,
    at: Date,
  ): Promise<boolean> {
    const [, affected] = await this.dataSource.query<[unknown, number]>(
      `UPDATE clients c SET return_reminder_asked_at = $3
       WHERE c.barbershop_id = $1 AND c.id = $2
         AND c.return_reminder_asked_at IS NULL
         AND NOT c.return_reminder_enabled
         AND NOT EXISTS (
               SELECT 1 FROM return_reminder_consents r
                WHERE r.barbershop_id = c.barbershop_id
                  AND r.client_id = c.id)`,
      [barbershopId, clientId, at],
    );
    return affected === 1;
  }

  async releasePrivacyNotice(client: Client, sentAt: Date): Promise<void> {
    await this.dataSource
      .createQueryBuilder()
      .update(ClientEntity)
      .set({ privacyNoticeSentAt: null })
      .where(
        'barbershop_id = :barbershopId AND id = :id AND privacy_notice_sent_at = :sentAt',
        { barbershopId: client.barbershopId, id: client.id, sentAt },
      )
      .execute();
  }
}

function toClient(
  row: Pick<
    ClientEntity,
    | 'id'
    | 'barbershopId'
    | 'name'
    | 'phone'
    | 'createdAt'
    | 'returnReminderEnabled'
    | 'returnReminderAskedAt'
  >,
): Client {
  return Client.restore({
    id: row.id,
    barbershopId: row.barbershopId,
    name: row.name,
    phone: row.phone,
    createdAt: row.createdAt,
    returnReminderEnabled: row.returnReminderEnabled,
    returnReminderAskedAt: row.returnReminderAskedAt,
  });
}

// The term is matched literally: % and _ are not wildcards (CA-12.1).
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}
