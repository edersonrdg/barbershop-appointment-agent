import { DataSource } from 'typeorm';
import { z } from 'zod';
import type { HandoffReason } from '../../../domain/value-objects/handoff-reason';
import {
  BookingDraft,
  ConversationEntry,
  ConversationRepository,
  WaitingConversation,
} from '../../../usecases/ports/conversation.repository.port';
import { BOOKING_PERIODS } from '../../../usecases/ports/message-interpreter.port';

// AD-013: the stored draft is read back through this schema; a value it does
// not accept is treated as no draft. A draft stored before US-18 has no action
// and is a booking (door 2); one stored before US-23 suggested no add-on.
const storedDraftSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['book', 'cancel', 'reschedule']).default('book'),
  candidates: z
    .array(
      z.object({
        appointmentId: z.string(),
        barberId: z.string(),
        startsAt: z.coerce.date(),
      }),
    )
    .default([]),
  targetAppointmentId: z.string().nullable().default(null),
  serviceIds: z.array(z.string()),
  barberId: z.string().nullable(),
  anyBarber: z.boolean(),
  date: z.string().nullable(),
  period: z.enum(BOOKING_PERIODS).nullable(),
  time: z.string().nullable(),
  offer: z.array(z.object({ barberId: z.string(), startsAt: z.coerce.date() })),
  addOnSuggestion: z
    .object({ serviceId: z.string(), pending: z.boolean() })
    .nullable()
    .default(null),
  updatedAt: z.coerce.date(),
});

interface EnteredRow {
  paused_at: Date | null;
  last_activity_at: Date;
}

// The Postgres driver of TypeORM answers an UPDATE with the returned rows and
// the affected count.
type Updated<T> = [T[], number];

interface WaitingRow {
  client_id: string;
  client_name: string;
  phone: string;
  pause_reason: HandoffReason;
  paused_at: Date;
  last_activity_at: Date;
}

// RN-23 (door 3): the pause holds while its latest activity is after the
// deadline; nothing lifts it on a schedule.
function pauseInForce(expiredBeforeParam: string): string {
  return `paused_at IS NOT NULL
          AND GREATEST(paused_at, last_activity_at) > ${expiredBeforeParam}`;
}

export class TypeOrmConversationRepository implements ConversationRepository {
  constructor(private readonly dataSource: DataSource) {}

  // The row lock serializes the messages of a client, so a pause is lifted
  // and counted once (door 2).
  enter(
    barbershopId: string,
    clientId: string,
    at: Date,
    expiredBefore: Date,
  ): Promise<ConversationEntry> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO whatsapp_conversations (barbershop_id, client_id, last_activity_at)
         VALUES ($1, $2, $3)
         ON CONFLICT ON CONSTRAINT "PK_whatsapp_conversations" DO NOTHING`,
        [barbershopId, clientId, at],
      );
      const [row] = await manager.query<EnteredRow[]>(
        `SELECT paused_at, last_activity_at
           FROM whatsapp_conversations
          WHERE barbershop_id = $1 AND client_id = $2
          FOR UPDATE`,
        [barbershopId, clientId],
      );
      const lastActivity =
        row.last_activity_at > at ? row.last_activity_at : at;
      const pausedAt = row.paused_at;
      if (!pausedAt || latest(pausedAt, row.last_activity_at) > expiredBefore) {
        await manager.query(
          `UPDATE whatsapp_conversations SET last_activity_at = $3
            WHERE barbershop_id = $1 AND client_id = $2`,
          [barbershopId, clientId, lastActivity],
        );
        return pausedAt ? 'paused' : 'active';
      }
      await manager.query(
        `UPDATE whatsapp_conversations
            SET paused_at = NULL, pause_reason = NULL,
                consecutive_failures = 0, last_activity_at = $3
          WHERE barbershop_id = $1 AND client_id = $2`,
        [barbershopId, clientId, lastActivity],
      );
      return 'resumed';
    });
  }

  async touchPaused(
    barbershopId: string,
    clientId: string,
    at: Date,
    expiredBefore: Date,
  ): Promise<boolean> {
    const [rows] = await this.dataSource.query<Updated<unknown>>(
      `UPDATE whatsapp_conversations
          SET last_activity_at = GREATEST(last_activity_at, $3)
        WHERE barbershop_id = $1 AND client_id = $2
          AND ${pauseInForce('$4')}
        RETURNING client_id`,
      [barbershopId, clientId, at, expiredBefore],
    );
    return rows.length === 1;
  }

  async recordFailure(barbershopId: string, clientId: string): Promise<number> {
    const [rows] = await this.dataSource.query<
      Updated<{ consecutive_failures: number }>
    >(
      `UPDATE whatsapp_conversations
          SET consecutive_failures = consecutive_failures + 1
        WHERE barbershop_id = $1 AND client_id = $2
        RETURNING consecutive_failures`,
      [barbershopId, clientId],
    );
    return rows[0]?.consecutive_failures ?? 0;
  }

  async resetFailures(barbershopId: string, clientId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE whatsapp_conversations SET consecutive_failures = 0
        WHERE barbershop_id = $1 AND client_id = $2
          AND consecutive_failures <> 0`,
      [barbershopId, clientId],
    );
  }

  async findDraft(
    barbershopId: string,
    clientId: string,
  ): Promise<BookingDraft | null> {
    const [row] = await this.dataSource.query<{ booking_draft: unknown }[]>(
      `SELECT booking_draft FROM whatsapp_conversations
        WHERE barbershop_id = $1 AND client_id = $2`,
      [barbershopId, clientId],
    );
    if (!row?.booking_draft) return null;
    const parsed = storedDraftSchema.safeParse(row.booking_draft);
    return parsed.success ? parsed.data : null;
  }

  async saveDraft(
    barbershopId: string,
    clientId: string,
    draft: BookingDraft,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE whatsapp_conversations SET booking_draft = $3
        WHERE barbershop_id = $1 AND client_id = $2`,
      [barbershopId, clientId, JSON.stringify(draft)],
    );
  }

  async clearDraft(barbershopId: string, clientId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE whatsapp_conversations SET booking_draft = NULL
        WHERE barbershop_id = $1 AND client_id = $2
          AND booking_draft IS NOT NULL`,
      [barbershopId, clientId],
    );
  }

  // Only the update that still finds this draft wins (AD-013).
  async consumeDraft(
    barbershopId: string,
    clientId: string,
    draftId: string,
  ): Promise<boolean> {
    const [rows] = await this.dataSource.query<Updated<unknown>>(
      `UPDATE whatsapp_conversations SET booking_draft = NULL
        WHERE barbershop_id = $1 AND client_id = $2
          AND booking_draft->>'id' = $3
        RETURNING client_id`,
      [barbershopId, clientId, draftId],
    );
    return rows.length === 1;
  }

  // Only the update that finds no pause wins (door 2).
  async pause(
    barbershopId: string,
    clientId: string,
    reason: HandoffReason,
    at: Date,
  ): Promise<boolean> {
    const [rows] = await this.dataSource.query<Updated<unknown>>(
      `UPDATE whatsapp_conversations
          SET paused_at = $4, pause_reason = $3, booking_draft = NULL
        WHERE barbershop_id = $1 AND client_id = $2 AND paused_at IS NULL
        RETURNING client_id`,
      [barbershopId, clientId, reason, at],
    );
    return rows.length === 1;
  }

  async resume(barbershopId: string, clientId: string): Promise<boolean> {
    const [rows] = await this.dataSource.query<Updated<unknown>>(
      `UPDATE whatsapp_conversations
          SET paused_at = NULL, pause_reason = NULL, consecutive_failures = 0,
              booking_draft = NULL
        WHERE barbershop_id = $1 AND client_id = $2 AND paused_at IS NOT NULL
        RETURNING client_id`,
      [barbershopId, clientId],
    );
    return rows.length === 1;
  }

  async listWaiting(
    barbershopId: string,
    expiredBefore: Date,
  ): Promise<WaitingConversation[]> {
    const rows = await this.dataSource.query<WaitingRow[]>(
      `SELECT w.client_id, c.name AS client_name, c.phone, w.pause_reason,
              w.paused_at, w.last_activity_at
         FROM whatsapp_conversations w
         JOIN clients c
           ON c.id = w.client_id AND c.barbershop_id = w.barbershop_id
        WHERE w.barbershop_id = $1
          AND ${pauseInForce('$2')}
        ORDER BY w.paused_at, w.client_id`,
      [barbershopId, expiredBefore],
    );
    return rows.map((row) => ({
      clientId: row.client_id,
      clientName: row.client_name,
      phone: row.phone,
      reason: row.pause_reason,
      pausedAt: row.paused_at,
      lastActivityAt: row.last_activity_at,
    }));
  }
}

function latest(a: Date, b: Date): Date {
  return a > b ? a : b;
}
