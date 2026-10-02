import { SubscriptionStatus } from '../../domain/entities/barbershop';
import { EmailMessage, EmailSender } from '../ports/email-sender.port';
import { FakeEmailSender } from '../testing/fake-email-sender';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository';
import { SettableClock } from '../testing/settable-clock';
import {
  APP_WEB_URL,
  barbershopOf,
  OTHER_SHOP_ID,
  ownerOf,
  SHOP_ID,
  SUBSCRIPTION_NOW,
  SubscriptionScenario,
  subscriptionOf,
  subscriptionScenario,
  WARNING_DAYS,
} from '../testing/subscription-fixtures';
import { SendTrialEndingWarningsUseCase } from './send-trial-ending-warnings.use-case';

const SUBJECT = 'Seu teste gratuito termina em breve';
const TEXT =
  'Olá, Ana Souza! O teste gratuito da Barbearia do Zé termina em 04/10/2026. Para continuar usando, assine em http://painel.test/assinatura.';

class FailingFor implements EmailSender {
  readonly sent: EmailMessage[] = [];
  constructor(private readonly address: string) {}

  send(message: EmailMessage): Promise<void> {
    if (message.to === this.address) {
      return Promise.reject(new Error('smtp down'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}

describe('US-20 send trial ending warnings', () => {
  let scenario: SubscriptionScenario;
  let emailSender: EmailSender & { sent: EmailMessage[] };

  function setup(
    overrides: Parameters<typeof subscriptionScenario>[0] = {},
    warningDays = WARNING_DAYS,
  ): SendTrialEndingWarningsUseCase {
    scenario = subscriptionScenario(overrides);
    emailSender ??= new FakeEmailSender();
    return new SendTrialEndingWarningsUseCase(
      new InMemoryBarbershopRepository(scenario.store),
      scenario.subscriptions,
      new InMemoryUserRepository(scenario.store),
      emailSender,
      new SettableClock(SUBSCRIPTION_NOW),
      { warningDays, appWebUrl: APP_WEB_URL },
    );
  }

  beforeEach(() => {
    emailSender = new FakeEmailSender();
  });

  it('CA-20.2: each Owner gets one warning and the barber none; a second run sends nothing (C23)', async () => {
    const useCase = setup();
    scenario.store.users.push(
      ownerOf(
        SHOP_ID,
        '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
        'Bia Lima',
        'bia@barbearia.test',
      ),
    );

    const first = await useCase.execute();

    expect(first).toEqual({ warned: 1, failures: [] });
    expect(
      [...emailSender.sent].sort((a, b) => a.to.localeCompare(b.to)),
    ).toEqual([
      { to: 'ana@barbearia.test', subject: SUBJECT, text: TEXT },
      {
        to: 'bia@barbearia.test',
        subject: SUBJECT,
        text: TEXT.replace('Ana Souza', 'Bia Lima'),
      },
    ]);
    expect(scenario.subscriptions.trialWarnings.get(SHOP_ID)).toEqual(
      SUBSCRIPTION_NOW,
    );

    const second = await useCase.execute();

    expect(second).toEqual({ warned: 0, failures: [] });
    expect(emailSender.sent).toHaveLength(2);
  });

  it.each<[string, string, number, boolean]>([
    ['exactly 3 days', '2026-10-05T15:00:00.000Z', 3, true],
    ['3 days and 1 minute', '2026-10-05T15:01:00.000Z', 3, false],
    ['1 minute', '2026-10-02T15:01:00.000Z', 3, true],
    ['now', '2026-10-02T15:00:00.000Z', 3, false],
    ['in the past', '2026-10-01T15:00:00.000Z', 3, false],
    ['5 days with 5 configured', '2026-10-07T15:00:00.000Z', 5, true],
  ])(
    'AC 18, AC 22: a trial ending in %s is warned: %s (C24)',
    async (_label, trialEndsAt, days, warned) => {
      const useCase = setup({ trialEndsAt: new Date(trialEndsAt) }, days);

      const result = await useCase.execute();

      expect(result.warned).toBe(warned ? 1 : 0);
      expect(emailSender.sent).toHaveLength(warned ? 1 : 0);
      expect(scenario.subscriptions.trialWarnings.has(SHOP_ID)).toBe(warned);
    },
  );

  it.each<[SubscriptionStatus]>([['active'], ['past_due']])(
    'AC 20: a barbershop %s is not warned (C25)',
    async (status) => {
      const useCase = setup({ status });

      const result = await useCase.execute();

      expect(result.warned).toBe(0);
      expect(emailSender.sent).toHaveLength(0);
      expect(scenario.subscriptions.trialWarnings.has(SHOP_ID)).toBe(false);
    },
  );

  it('AC 21: a failed e-mail keeps the warning claimed and the run goes on (C26)', async () => {
    emailSender = new FailingFor('ana@barbearia.test');
    const useCase = setup();
    scenario.store.barbershops.push(
      barbershopOf(OTHER_SHOP_ID, 'Barbearia da Rua'),
    );
    scenario.store.users.push(
      ownerOf(
        OTHER_SHOP_ID,
        '4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a',
        'Caio Melo',
        'caio@barbearia.test',
      ),
    );
    scenario.subscriptions.add(subscriptionOf({ barbershopId: OTHER_SHOP_ID }));

    const first = await useCase.execute();

    expect(first.warned).toBe(1);
    expect(first.failures.map((failure) => failure.barbershopId)).toEqual([
      SHOP_ID,
    ]);
    expect(emailSender.sent.map((message) => message.to)).toEqual([
      'caio@barbearia.test',
    ]);
    expect(scenario.subscriptions.trialWarnings.has(SHOP_ID)).toBe(true);
    expect(scenario.subscriptions.trialWarnings.has(OTHER_SHOP_ID)).toBe(true);

    emailSender.sent.length = 0;
    const healthy = new SendTrialEndingWarningsUseCase(
      new InMemoryBarbershopRepository(scenario.store),
      scenario.subscriptions,
      new InMemoryUserRepository(scenario.store),
      new FakeEmailSender(),
      new SettableClock(SUBSCRIPTION_NOW),
      { warningDays: WARNING_DAYS, appWebUrl: APP_WEB_URL },
    );
    expect(await healthy.execute()).toEqual({ warned: 0, failures: [] });
  });
});
