import { TrialEndingWarningJob } from '../src/infrastructure/jobs/trial-ending-warning.job';
import { TRIAL_ENDING_EMAIL_SUBJECT } from '../src/usecases/send-trial-ending-warnings/send-trial-ending-warnings.use-case';
import { signupOwner } from './support/account-flows';
import {
  barbershopOfOwner,
  createSubscriptionTestApp,
  SubscriptionTestApp,
} from './support/subscription-test-app';
import { truncateAccountTables } from './support/truncate-account-tables';

const OWNER_EMAIL = 'ana@barbearia.test';

describe('US-20 trial ending warning job (e2e)', () => {
  let t: SubscriptionTestApp;

  beforeAll(async () => {
    t = await createSubscriptionTestApp();
  });

  beforeEach(async () => {
    await truncateAccountTables(t.dataSource);
    t.emailSender.sent.length = 0;
  });

  afterAll(async () => {
    await truncateAccountTables(t.dataSource);
    await t.app.close();
  });

  it('door 7: two simultaneous runs send the Owner exactly one warning (C28)', async () => {
    await signupOwner(t.app, OWNER_EMAIL);
    const shop = await barbershopOfOwner(t.dataSource, OWNER_EMAIL);
    await t.dataSource.query(
      'UPDATE barbershops SET trial_ends_at = $2 WHERE id = $1',
      [shop, new Date('2026-10-04T15:00:00.000Z')],
    );
    const job = t.app.get(TrialEndingWarningJob);

    await Promise.all([job.run(), job.run()]);

    const warnings = t.emailSender.sent.filter(
      (message) => message.subject === TRIAL_ENDING_EMAIL_SUBJECT,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].to).toBe(OWNER_EMAIL);
  });
});
