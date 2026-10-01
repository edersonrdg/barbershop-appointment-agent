import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { errorIdentity } from './error-identity';
import { ResetExpiredNoShowsUseCase } from '../../usecases/reset-expired-no-shows/reset-expired-no-shows.use-case';

export const NO_SHOW_RESET_JOB = 'no-show-reset';

// RN-13: once a day, off business hours. Every API instance runs it; the reset
// is idempotent, so a repeated run changes nothing (ATD-25).
@Injectable()
export class NoShowResetJob {
  private readonly logger = new Logger(NoShowResetJob.name);

  constructor(
    private readonly resetExpiredNoShows: ResetExpiredNoShowsUseCase,
  ) {}

  @Cron('0 3 * * *', {
    name: NO_SHOW_RESET_JOB,
    timeZone: 'America/Sao_Paulo',
  })
  async run(): Promise<void> {
    try {
      const { clientsReset, failures } =
        await this.resetExpiredNoShows.execute();
      for (const { barbershopId, error } of failures) {
        this.logger.error(
          { barbershopId, err: errorIdentity(error) },
          'No-show reset failed for a barbershop.',
        );
      }
      this.logger.log(
        { clientsReset, failedBarbershops: failures.length },
        'No-show reset finished.',
      );
    } catch (error) {
      this.logger.error({ err: errorIdentity(error) }, 'No-show reset failed.');
    }
  }
}
