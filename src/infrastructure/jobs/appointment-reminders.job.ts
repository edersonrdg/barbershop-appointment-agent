import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SendAppointmentRemindersUseCase } from '../../usecases/send-appointment-reminders/send-appointment-reminders.use-case';
import { errorIdentity } from './error-identity';

export const APPOINTMENT_REMINDERS_JOB = 'appointment-reminders';

// US-19 (door 3): every minute, so a reminder goes out within a minute of its
// moment. Every API instance runs it; the claim of each reminder makes only one
// of them send it.
@Injectable()
export class AppointmentRemindersJob {
  private readonly logger = new Logger(AppointmentRemindersJob.name);

  constructor(
    private readonly sendReminders: SendAppointmentRemindersUseCase,
  ) {}

  @Cron('* * * * *', {
    name: APPOINTMENT_REMINDERS_JOB,
    timeZone: 'America/Sao_Paulo',
  })
  async run(): Promise<void> {
    try {
      const { sent, failed, failures } = await this.sendReminders.execute();
      for (const { barbershopId, error } of failures) {
        this.logger.error(
          { barbershopId, err: errorIdentity(error) },
          'Appointment reminders failed for a barbershop.',
        );
      }
      this.logger.log(
        { sent, failed, failedBarbershops: failures.length },
        'Appointment reminders finished.',
      );
    } catch (error) {
      this.logger.error(
        { err: errorIdentity(error) },
        'Appointment reminders failed.',
      );
    }
  }
}
