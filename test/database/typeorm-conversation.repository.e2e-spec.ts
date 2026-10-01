import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/infrastructure/config/env.schema';
import { TypeOrmConversationRepository } from '../../src/infrastructure/database/repositories/typeorm-conversation.repository';
import { buildTypeOrmOptions } from '../../src/infrastructure/database/typeorm.options';
import { BookingDraft } from '../../src/usecases/ports/conversation.repository.port';
import { truncateAccountTables } from '../support/truncate-account-tables';

const NOW = new Date('2026-09-29T15:00:00.000Z');

describe('TypeOrmConversationRepository booking draft (e2e)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmConversationRepository;
  let barbershopId: string;
  let clientId: string;

  function draft(id = 'draft-1'): BookingDraft {
    return {
      id,
      action: 'book',
      candidates: [],
      targetAppointmentId: null,
      serviceIds: [randomUUID()],
      barberId: randomUUID(),
      anyBarber: false,
      date: '2026-09-30',
      period: 'afternoon',
      time: null,
      offer: [
        {
          barberId: randomUUID(),
          startsAt: new Date('2026-09-30T15:00:00.000Z'),
        },
        {
          barberId: randomUUID(),
          startsAt: new Date('2026-09-30T15:30:00.000Z'),
        },
      ],
      updatedAt: NOW,
    };
  }

  async function storedDraft(): Promise<unknown> {
    const [row] = await dataSource.query<{ booking_draft: unknown }[]>(
      `SELECT booking_draft FROM whatsapp_conversations
        WHERE barbershop_id = $1 AND client_id = $2`,
      [barbershopId, clientId],
    );
    return row.booking_draft;
  }

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
    await dataSource.initialize();
    repository = new TypeOrmConversationRepository(dataSource);
  });

  beforeEach(async () => {
    await truncateAccountTables(dataSource);
    barbershopId = randomUUID();
    await dataSource.query(
      `INSERT INTO barbershops (id, name, timezone, subscription_status, trial_ends_at, created_at)
       VALUES ($1, 'Barbearia', 'America/Sao_Paulo', 'trialing', now(), now())`,
      [barbershopId],
    );
    clientId = randomUUID();
    await dataSource.query(
      `INSERT INTO clients (id, barbershop_id, name, phone, created_at)
       VALUES ($1, $2, 'Carlos', '+5511987654321', now())`,
      [clientId, barbershopId],
    );
    await repository.enter(barbershopId, clientId, NOW, new Date(0));
  });

  afterAll(async () => {
    await truncateAccountTables(dataSource);
    await dataSource.destroy();
  });

  it('door 2 (C39): reads back the saved draft', async () => {
    const saved = draft();
    await repository.saveDraft(barbershopId, clientId, saved);

    await expect(repository.findDraft(barbershopId, clientId)).resolves.toEqual(
      saved,
    );
  });

  it('door 2 (C39): reads an invalid stored draft as no draft', async () => {
    await dataSource.query(
      `UPDATE whatsapp_conversations SET booking_draft = '{"foo": 1}'::jsonb
        WHERE barbershop_id = $1 AND client_id = $2`,
      [barbershopId, clientId],
    );

    await expect(
      repository.findDraft(barbershopId, clientId),
    ).resolves.toBeNull();
  });

  it('door 2 (C39): consumes the offer once and only with its id', async () => {
    await repository.saveDraft(barbershopId, clientId, draft());

    await expect(
      repository.consumeDraft(barbershopId, clientId, 'other-draft'),
    ).resolves.toBe(false);
    await expect(
      repository.consumeDraft(barbershopId, clientId, 'draft-1'),
    ).resolves.toBe(true);
    await expect(
      repository.consumeDraft(barbershopId, clientId, 'draft-1'),
    ).resolves.toBe(false);
    expect(await storedDraft()).toBeNull();
  });

  it('door 2 (C39): pausing and resuming drop the draft', async () => {
    await repository.saveDraft(barbershopId, clientId, draft());
    await repository.pause(barbershopId, clientId, 'requested', NOW);
    expect(await storedDraft()).toBeNull();

    await repository.saveDraft(barbershopId, clientId, draft('draft-2'));
    await repository.resume(barbershopId, clientId);
    expect(await storedDraft()).toBeNull();
  });

  describe('US-18', () => {
    it('door 2 (C33): reads back a draft listing appointments', async () => {
      const listing: BookingDraft = {
        ...draft(),
        action: 'cancel',
        candidates: [
          {
            appointmentId: randomUUID(),
            barberId: randomUUID(),
            startsAt: new Date('2026-09-29T18:00:00.000Z'),
          },
          {
            appointmentId: randomUUID(),
            barberId: randomUUID(),
            startsAt: new Date('2026-09-30T13:00:00.000Z'),
          },
        ],
        targetAppointmentId: null,
        offer: [],
      };
      await repository.saveDraft(barbershopId, clientId, listing);

      expect(await repository.findDraft(barbershopId, clientId)).toEqual(
        listing,
      );
    });

    it('door 2 (C33): reads a draft stored before US-18 as a booking', async () => {
      const { action, candidates, targetAppointmentId, ...legacy } = draft();
      expect([action, candidates, targetAppointmentId]).toEqual([
        'book',
        [],
        null,
      ]);
      await dataSource.query(
        `UPDATE whatsapp_conversations SET booking_draft = $3
          WHERE barbershop_id = $1 AND client_id = $2`,
        [barbershopId, clientId, JSON.stringify(legacy)],
      );

      expect(await repository.findDraft(barbershopId, clientId)).toEqual({
        ...legacy,
        action: 'book',
        candidates: [],
        targetAppointmentId: null,
      });
    });
  });
});
