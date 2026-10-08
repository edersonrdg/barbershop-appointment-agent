import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SendReturnRemindersUseCase } from '../../usecases/send-return-reminders/send-return-reminders.use-case';
import { errorIdentity } from './error-identity';

export const RETURN_REMINDER_JOB = 'return-reminder';

// US-25 (door 3): every minute, so the question follows the attendance and the
// invite goes out at the time it is due. Every API instance runs it; the claim
// of each message makes only one of them send it (AD-019).
@Injectable()
export class ReturnReminderJob {
  private readonly logger = new Logger(ReturnReminderJob.name);

  constructor(private readonly sendReminders: SendReturnRemindersUseCase) {}

  @Cron('* * * * *', {
    name: RETURN_REMINDER_JOB,
    timeZone: 'America/Sao_Paulo',
  })
  async run(): Promise<void> {
    try {
      const { questions, invites, failed, failures, sendFailures } =
        await this.sendReminders.execute();
      for (const { barbershopId, clientId, kind, error } of sendFailures) {
        this.logger.error(
          { barbershopId, clientId, kind, err: errorIdentity(error) },
          'Return reminder message could not be sent.',
        );
      }
      for (const { barbershopId, error } of failures) {
        this.logger.error(
          { barbershopId, err: errorIdentity(error) },
          'Return reminders failed for a barbershop.',
        );
      }
      this.logger.log(
        { questions, invites, failed, failedBarbershops: failures.length },
        'Return reminders finished.',
      );
    } catch (error) {
      this.logger.error(
        { err: errorIdentity(error) },
        'Return reminders failed.',
      );
    }
  }
}
