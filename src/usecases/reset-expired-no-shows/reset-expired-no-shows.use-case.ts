import { noShowResetCutoff } from '../../domain/value-objects/no-show-reset';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { Clock } from '../ports/clock.port';
import { NoShowLedger } from '../ports/no-show-ledger.port';

export interface ResetExpiredNoShowsResult {
  clientsReset: number;
  failedBarbershops: number;
}

export class ResetExpiredNoShowsUseCase {
  constructor(
    private readonly barbershops: BarbershopRepository,
    private readonly ledger: NoShowLedger,
    private readonly clock: Clock,
  ) {}

  // RN-13 and AD-009: the reset runs barbershop by barbershop (RN-26); a
  // failing barbershop is counted and skipped, and the next daily run redoes
  // it because the reset is idempotent.
  async execute(): Promise<ResetExpiredNoShowsResult> {
    const now = this.clock.now();
    const cutoff = noShowResetCutoff(now);
    const result: ResetExpiredNoShowsResult = {
      clientsReset: 0,
      failedBarbershops: 0,
    };
    for (const barbershopId of await this.barbershops.listIds()) {
      try {
        result.clientsReset += await this.ledger.resetExpired(
          barbershopId,
          cutoff,
          now,
        );
      } catch {
        result.failedBarbershops += 1;
      }
    }
    return result;
  }
}
