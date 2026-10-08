import { Logger } from '@nestjs/common';
import {
  SendReturnRemindersResult,
  SendReturnRemindersUseCase,
} from '../../usecases/send-return-reminders/send-return-reminders.use-case';
import { ReturnReminderJob } from './return-reminder.job';

class DatabaseError extends Error {
  override readonly name = 'QueryFailedError';
  readonly code = '57014';
}

function jobReturning(result: SendReturnRemindersResult): ReturnReminderJob {
  const useCase = {
    execute: () => Promise.resolve(result),
  } as unknown as SendReturnRemindersUseCase;
  return new ReturnReminderJob(useCase);
}

describe('US-25 ReturnReminderJob', () => {
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

  it('US-25 AC 24 (C26): logs the counts of the run and each failure without the client phone or name', async () => {
    const job = jobReturning({
      questions: 2,
      invites: 3,
      failed: 1,
      failures: [
        {
          barbershopId: 'barbershop-a',
          error: new DatabaseError('Ana Lima +5511911110001 timed out'),
        },
      ],
      sendFailures: [
        {
          barbershopId: 'barbershop-b',
          clientId: 'client-1',
          kind: 'invite',
          error: new DatabaseError('+5511911110001 Oi, Ana!'),
        },
      ],
    });

    await job.run();

    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      {
        barbershopId: 'barbershop-b',
        clientId: 'client-1',
        kind: 'invite',
        err: { name: 'QueryFailedError', code: '57014' },
      },
      'Return reminder message could not be sent.',
    );
    expect(errorSpy).toHaveBeenCalledWith(
      {
        barbershopId: 'barbershop-a',
        err: { name: 'QueryFailedError', code: '57014' },
      },
      'Return reminders failed for a barbershop.',
    );
    expect(logSpy).toHaveBeenCalledWith(
      { questions: 2, invites: 3, failed: 1, failedBarbershops: 1 },
      'Return reminders finished.',
    );
    const logged = JSON.stringify([errorSpy.mock.calls, logSpy.mock.calls]);
    expect(logged).not.toContain('+5511911110001');
    expect(logged).not.toContain('Ana');
  });

  it('US-25 (C26): logs a failure of the whole run instead of throwing', async () => {
    const useCase = {
      execute: () => Promise.reject(new DatabaseError('down')),
    } as unknown as SendReturnRemindersUseCase;

    await new ReturnReminderJob(useCase).run();

    expect(errorSpy).toHaveBeenCalledWith(
      { err: { name: 'QueryFailedError', code: '57014' } },
      'Return reminders failed.',
    );
  });
});
