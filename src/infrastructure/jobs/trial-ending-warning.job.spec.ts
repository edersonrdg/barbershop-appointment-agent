import { Logger } from '@nestjs/common';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import {
  SendTrialEndingWarningsResult,
  SendTrialEndingWarningsUseCase,
} from '../../usecases/send-trial-ending-warnings/send-trial-ending-warnings.use-case';
import { TrialEndingWarningJob } from './trial-ending-warning.job';

class SmtpError extends Error {
  override readonly name = 'SmtpError';
  readonly code = 'EAUTH';
}

function jobReturning(
  result: SendTrialEndingWarningsResult,
): TrialEndingWarningJob {
  const useCase = {
    execute: () => Promise.resolve(result),
  } as unknown as SendTrialEndingWarningsUseCase;
  return new TrialEndingWarningJob(useCase);
}

describe('US-20 TrialEndingWarningJob', () => {
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

  it('AC 21: logs each failing barbershop without the e-mail, and the totals of the run (C27)', async () => {
    const job = jobReturning({
      warned: 2,
      failures: [
        {
          barbershopId: 'barbershop-a',
          error: new SmtpError('550 ana@barbearia.test rejected'),
        },
      ],
    });

    await job.run();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      {
        barbershopId: 'barbershop-a',
        err: { name: 'SmtpError', code: 'EAUTH' },
      },
      'Trial ending warning failed for a barbershop.',
    );
    expect(logSpy).toHaveBeenCalledWith(
      { warned: 2, failedBarbershops: 1 },
      'Trial ending warnings finished.',
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('@');
  });

  it('AC 21: a run without failures logs no error (C27)', async () => {
    await jobReturning({ warned: 0, failures: [] }).run();

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('door 7: the job runs at minute 0 of every hour (C27)', () => {
    const run = Object.getOwnPropertyDescriptor(
      TrialEndingWarningJob.prototype,
      'run',
    )?.value as object;
    const options = Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, run) as {
      cronTime: string;
    };

    expect(options.cronTime).toBe('0 * * * *');
  });
});
