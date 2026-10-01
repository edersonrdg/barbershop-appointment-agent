import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';

// The cron jobs would fire on the wall clock in the middle of a suite (the
// reminders run every minute, US-19) and act on its data; suites that test a
// job call its `run()` themselves.
export function stopScheduledJobs(app: INestApplication): void {
  for (const job of app.get(SchedulerRegistry).getCronJobs().values()) {
    void job.stop();
  }
}
