import { DataSource } from 'typeorm';
import { Client } from '../../../domain/entities/client';
import {
  ClientRepository,
  ClientSearch,
} from '../../../usecases/ports/client.repository.port';
import { ClientEntity } from '../entities/client.entity';

interface ClientRow {
  id: string;
  barbershop_id: string;
  name: string;
  phone: string;
  created_at: Date;
  return_reminder_enabled: boolean;
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
              c.return_reminder_enabled
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
      }),
    );
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
  >,
): Client {
  return Client.restore({
    id: row.id,
    barbershopId: row.barbershopId,
    name: row.name,
    phone: row.phone,
    createdAt: row.createdAt,
    returnReminderEnabled: row.returnReminderEnabled,
  });
}

// The term is matched literally: % and _ are not wildcards (CA-12.1).
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}
