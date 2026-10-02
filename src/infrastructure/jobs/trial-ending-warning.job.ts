import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SendTrialEndingWarningsUseCase } from '../../usecases/send-trial-ending-warnings/send-trial-ending-warnings.use-case';
import { errorIdentity } from './error-identity';

export const TRIAL_ENDING_WARNING_JOB = 'trial-ending-warning';
export const TRIAL_ENDING_WARNING_CRON = '0 * * * *';

// US-20 (door 7): every hour, so the warning goes out within an hour of the
// trial reaching its last days. Every API instance runs it; the claim of each
// warning makes only one of them send it.
@Injectable()
export class TrialEndingWarningJob {
  private readonly logger = new Logger(TrialEndingWarningJob.name);

  constructor(private readonly sendWarnings: SendTrialEndingWarningsUseCase) {}

  @Cron(TRIAL_ENDING_WARNING_CRON, {
    name: TRIAL_ENDING_WARNING_JOB,
    timeZone: 'America/Sao_Paulo',
  })
  async run(): Promise<void> {
    try {
      const { warned, failures } = await this.sendWarnings.execute();
      for (const { barbershopId, error } of failures) {
        this.logger.error(
          { barbershopId, err: errorIdentity(error) },
          'Trial ending warning failed for a barbershop.',
        );
      }
      this.logger.log(
        { warned, failedBarbershops: failures.length },
        'Trial ending warnings finished.',
      );
    } catch (error) {
      this.logger.error(
        { err: errorIdentity(error) },
        'Trial ending warnings failed.',
      );
    }
  }
}
