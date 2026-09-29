import { Logger } from '@nestjs/common';
import {
  ResetExpiredNoShowsResult,
  ResetExpiredNoShowsUseCase,
} from '../../usecases/reset-expired-no-shows/reset-expired-no-shows.use-case';
import { NoShowResetJob } from './no-show-reset.job';

class DatabaseError extends Error {
  override readonly name = 'QueryFailedError';
  readonly code = '57014';
}

function jobReturning(result: ResetExpiredNoShowsResult): NoShowResetJob {
  const useCase = {
    execute: () => Promise.resolve(result),
  } as unknown as ResetExpiredNoShowsUseCase;
  return new NoShowResetJob(useCase);
}

describe('NoShowResetJob', () => {
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

  it('RN-13: logs the error of each failing barbershop and the totals of the run (ATD-27)', async () => {
    const job = jobReturning({
      clientsReset: 3,
      failures: [
        {
          barbershopId: 'barbershop-a',
          error: new DatabaseError('Maria +5511987654321 timed out'),
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
      'No-show reset failed for a barbershop.',
    );
    expect(logSpy).toHaveBeenCalledWith(
      { clientsReset: 3, failedBarbershops: 1 },
      'No-show reset finished.',
    );
    const logged = JSON.stringify([errorSpy.mock.calls, logSpy.mock.calls]);
    expect(logged).not.toContain('Maria');
    expect(logged).not.toContain('987654321');
  });

  it('RN-13: a run without failures logs no error (ATD-27)', async () => {
    await jobReturning({ clientsReset: 0, failures: [] }).run();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      { clientsReset: 0, failedBarbershops: 0 },
      'No-show reset finished.',
    );
  });
});
