import { NoShowLedger } from '../ports/no-show-ledger.port';
import { InMemoryAppointmentRepository } from './in-memory-appointment.repository';

// Mirrors the SQL of TypeOrmNoShowLedger over the in-memory appointments, with
// the reset marks (`clients.no_show_reset_at`) kept per barbershop and client.
export class InMemoryNoShowLedger implements NoShowLedger {
  private readonly resets = new Map<string, Date>();

  constructor(private readonly appointments: InMemoryAppointmentRepository) {}

  /** Seeds a previous reset of the client (RN-13). */
  setResetAt(barbershopId: string, clientId: string, resetAt: Date): void {
    this.resets.set(key(barbershopId, clientId), resetAt);
  }

  resetAtOf(barbershopId: string, clientId: string): Date | null {
    return this.resets.get(key(barbershopId, clientId)) ?? null;
  }

  async countFor(barbershopId: string, clientId: string): Promise<number> {
    const counted = await this.countedNoShows(barbershopId);
    return counted.filter((appointment) => appointment.clientId === clientId)
      .length;
  }

  async resetExpired(
    barbershopId: string,
    cutoff: Date,
    now: Date,
  ): Promise<number> {
    const latestByClient = new Map<string, Date>();
    for (const { clientId, startsAt } of await this.countedNoShows(
      barbershopId,
    )) {
      const latest = latestByClient.get(clientId);
      if (!latest || startsAt > latest) {
        latestByClient.set(clientId, startsAt);
      }
    }
    let reset = 0;
    for (const [clientId, latest] of latestByClient) {
      if (latest > cutoff) continue;
      this.resets.set(key(barbershopId, clientId), now);
      reset += 1;
    }
    return reset;
  }

  resetClient(
    barbershopId: string,
    clientId: string,
    now: Date,
  ): Promise<void> {
    this.resets.set(key(barbershopId, clientId), now);
    return Promise.resolve();
  }

  private async countedNoShows(barbershopId: string): Promise<CountedNoShow[]> {
    const stored = await this.appointments.list(barbershopId);
    return stored.flatMap(({ status, clientId, startsAt }) => {
      if (status !== 'no_show' || !clientId) return [];
      const resetAt = this.resetAtOf(barbershopId, clientId);
      return !resetAt || startsAt > resetAt ? [{ clientId, startsAt }] : [];
    });
  }
}

interface CountedNoShow {
  clientId: string;
  startsAt: Date;
}

function key(barbershopId: string, clientId: string): string {
  return `${barbershopId}:${clientId}`;
}
