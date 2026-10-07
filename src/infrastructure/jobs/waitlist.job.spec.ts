import { Logger } from '@nestjs/common';
import {
  ProcessWaitlistResult,
  ProcessWaitlistUseCase,
} from '../../usecases/process-waitlist/process-waitlist.use-case';
import { WaitlistJob } from './waitlist.job';

class DatabaseError extends Error {
  override readonly name = 'QueryFailedError';
  readonly code = '57014';
}

function jobReturning(result: ProcessWaitlistResult): WaitlistJob {
  const useCase = {
    execute: () => Promise.resolve(result),
  } as unknown as ProcessWaitlistUseCase;
  return new WaitlistJob(useCase);
}

describe('US-24 WaitlistJob', () => {
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

  it('US-24 AC 26 (C27): logs the counts of the run and each failure without the client phone or name', async () => {
    const job = jobReturning({
      offered: 2,
      expiredOffers: 1,
      removedEntries: 3,
      failures: [
        {
          barbershopId: 'barbershop-a',
          error: new DatabaseError('Ana Lima +5511911110001 timed out'),
        },
      ],
      sendFailures: [
        {
          barbershopId: 'barbershop-b',
          offerId: 'offer-1',
          error: new DatabaseError('+5511911110001 Vagou um horário'),
        },
      ],
    });

    await job.run();

    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      {
        barbershopId: 'barbershop-b',
        offerId: 'offer-1',
        err: { name: 'QueryFailedError', code: '57014' },
      },
      'Waitlist offer could not be sent.',
    );
    expect(errorSpy).toHaveBeenCalledWith(
      {
        barbershopId: 'barbershop-a',
        err: { name: 'QueryFailedError', code: '57014' },
      },
      'Waitlist failed for a barbershop.',
    );
    expect(logSpy).toHaveBeenCalledWith(
      {
        offered: 2,
        sendFailed: 1,
        expiredOffers: 1,
        removedEntries: 3,
        failedBarbershops: 1,
      },
      'Waitlist finished.',
    );
    const logged = JSON.stringify([errorSpy.mock.calls, logSpy.mock.calls]);
    expect(logged).not.toContain('+5511911110001');
    expect(logged).not.toContain('Ana Lima');
  });

  it('US-24 (C27): logs a failure of the whole run instead of throwing', async () => {
    const useCase = {
      execute: () => Promise.reject(new DatabaseError('down')),
    } as unknown as ProcessWaitlistUseCase;

    await expect(new WaitlistJob(useCase).run()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      { err: { name: 'QueryFailedError', code: '57014' } },
      'Waitlist failed.',
    );
  });
});
