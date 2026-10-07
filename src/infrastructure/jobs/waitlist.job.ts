import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProcessWaitlistUseCase } from '../../usecases/process-waitlist/process-waitlist.use-case';
import { errorIdentity } from './error-identity';

export const WAITLIST_JOB = 'waitlist';

// US-24 (door 4): every minute, so a freed slot is offered and an offer passes
// to the next entry within a minute of its deadline. Every API instance runs
// it; the unique pending offer per slot makes only one of them offer (AD-015).
@Injectable()
export class WaitlistJob {
  private readonly logger = new Logger(WaitlistJob.name);

  constructor(private readonly processWaitlist: ProcessWaitlistUseCase) {}

  @Cron('* * * * *', { name: WAITLIST_JOB, timeZone: 'America/Sao_Paulo' })
  async run(): Promise<void> {
    try {
      const { offered, expiredOffers, removedEntries, failures, sendFailures } =
        await this.processWaitlist.execute();
      for (const { barbershopId, offerId, error } of sendFailures) {
        this.logger.error(
          { barbershopId, offerId, err: errorIdentity(error) },
          'Waitlist offer could not be sent.',
        );
      }
      for (const { barbershopId, error } of failures) {
        this.logger.error(
          { barbershopId, err: errorIdentity(error) },
          'Waitlist failed for a barbershop.',
        );
      }
      this.logger.log(
        {
          offered,
          sendFailed: sendFailures.length,
          expiredOffers,
          removedEntries,
          failedBarbershops: failures.length,
        },
        'Waitlist finished.',
      );
    } catch (error) {
      this.logger.error({ err: errorIdentity(error) }, 'Waitlist failed.');
    }
  }
}
