import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
      const result = await this.resetExpiredNoShows.execute();
      // LGPD: only counts, never a client's phone or name.
      this.logger.log(result, 'No-show reset finished.');
    } catch (error) {
      const err = error as { name?: string; code?: string };
      this.logger.error(
        { err: { name: err.name, code: err.code } },
        'No-show reset failed.',
      );
    }
  }
}
