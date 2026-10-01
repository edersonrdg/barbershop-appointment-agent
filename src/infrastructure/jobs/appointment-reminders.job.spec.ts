import { Logger } from '@nestjs/common';
import {
  SendAppointmentRemindersResult,
  SendAppointmentRemindersUseCase,
} from '../../usecases/send-appointment-reminders/send-appointment-reminders.use-case';
import { AppointmentRemindersJob } from './appointment-reminders.job';

class DatabaseError extends Error {
  override readonly name = 'QueryFailedError';
  readonly code = '57014';
}

function jobReturning(
  result: SendAppointmentRemindersResult,
): AppointmentRemindersJob {
  const useCase = {
    execute: () => Promise.resolve(result),
  } as unknown as SendAppointmentRemindersUseCase;
  return new AppointmentRemindersJob(useCase);
}

describe('US-19 AppointmentRemindersJob', () => {
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('AC 3 (C5): logs each failing barbershop without the phone or the text, and the totals of the run', async () => {
    const job = jobReturning({
      sent: 2,
      failed: 1,
      failures: [
        {
          barbershopId: 'barbershop-a',
          error: new DatabaseError(
            'Carlos +5511987654321 Lembrete do seu horário timed out',
          ),
        },
      ],
    });

    await job.run();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      {
        barbershopId: 'barbershop-a',
        err: { name: 'QueryFailedError', code: '57014' },
      },
      'Appointment reminders failed for a barbershop.',
    );
    expect(logSpy).toHaveBeenCalledWith(
      { sent: 2, failed: 1, failedBarbershops: 1 },
      'Appointment reminders finished.',
    );
    const logged = JSON.stringify([errorSpy.mock.calls, logSpy.mock.calls]);
    expect(logged).not.toContain('Carlos');
    expect(logged).not.toContain('987654321');
    expect(logged).not.toContain('Lembrete');
  });

  it('AC 3 (C5): a run without failures logs no error', async () => {
    await jobReturning({ sent: 0, failed: 0, failures: [] }).run();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      { sent: 0, failed: 0, failedBarbershops: 0 },
      'Appointment reminders finished.',
    );
  });
});
