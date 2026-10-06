import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  BarbershopSubscriptionProps,
  SuspensionReason,
} from '../../domain/entities/barbershop-subscription';
import { AllowWhileSuspended } from '../../interface-adapters/controllers/allow-while-suspended.decorator';
import { AuthenticatedSession } from '../../interface-adapters/controllers/authenticated-session';
import { Public } from '../../interface-adapters/controllers/public.decorator';
import { GetSuspensionReasonUseCase } from '../../usecases/get-suspension-reason/get-suspension-reason.use-case';
import { CountingPaymentMetrics } from '../../usecases/testing/counting-payment-metrics';
import { InMemorySubscriptionRepository } from '../../usecases/testing/in-memory-subscription.repository';
import { SettableClock } from '../../usecases/testing/settable-clock';
import {
  SHOP_ID,
  SUBSCRIPTION_NOW,
  subscriptionOf,
} from '../../usecases/testing/subscription-fixtures';
import {
  SUSPENDED_WRITE_MESSAGE,
  SubscriptionAccessGuard,
} from './subscription-access.guard';

const DAY_MS = 24 * 60 * 60 * 1000;

class WriteController {
  handler(): void {}
}

class AllowedController {
  @AllowWhileSuspended()
  handler(): void {}
}

@Public()
class PublicController {
  handler(): void {}
}

const SUSPENDED: Record<
  SuspensionReason,
  Partial<BarbershopSubscriptionProps>
> = {
  trial_ended: { trialEndsAt: new Date(SUBSCRIPTION_NOW.getTime() - DAY_MS) },
  payment_overdue: {
    status: 'past_due',
    paymentMethod: 'credit_card',
    gatewaySubscriptionId: 'sub_1',
    paidUntil: '2026-10-02',
    paymentFailedAt: new Date(SUBSCRIPTION_NOW.getTime() - 6 * DAY_MS),
  },
  subscription_ended: {
    status: 'active',
    paymentMethod: 'credit_card',
    gatewaySubscriptionId: 'sub_1',
    paidUntil: '2026-10-01',
    cancelRequestedAt: new Date('2026-09-10T12:00:00.000Z'),
  },
};

const SESSION: AuthenticatedSession = {
  userId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  barbershopId: SHOP_ID,
  role: 'owner',
};

function contextFor(
  method: string,
  controller: { prototype: { handler: () => void } } = WriteController,
  session: AuthenticatedSession | undefined = SESSION,
): ExecutionContext {
  const request = { method, session };
  return {
    getHandler: () => controller.prototype.handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('US-21 SubscriptionAccessGuard', () => {
  let metrics: CountingPaymentMetrics;

  function guardFor(
    overrides: Partial<BarbershopSubscriptionProps> = {},
  ): SubscriptionAccessGuard {
    const subscriptions = new InMemorySubscriptionRepository();
    subscriptions.add(subscriptionOf(overrides));
    metrics = new CountingPaymentMetrics();
    return new SubscriptionAccessGuard(
      new Reflector(),
      new GetSuspensionReasonUseCase(
        subscriptions,
        new SettableClock(SUBSCRIPTION_NOW),
        5,
      ),
      metrics,
    );
  }

  it.each(Object.keys(SUSPENDED) as SuspensionReason[])(
    'AC 14, AC 20 (C24): a write of a barbershop suspended for %s gets 402 and counts the reason once',
    async (reason) => {
      const guard = guardFor(SUSPENDED[reason]);

      const error: unknown = await guard
        .canActivate(contextFor('POST'))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.PAYMENT_REQUIRED,
      );
      expect((error as HttpException).getResponse()).toEqual({
        message: SUSPENDED_WRITE_MESSAGE,
      });
      expect(metrics.blockedWrites).toEqual([reason]);
    },
  );

  it('AC 20 (C24): a read and an allowed write of a suspended barbershop count nothing', async () => {
    const guard = guardFor(SUSPENDED.trial_ended);

    await expect(guard.canActivate(contextFor('GET'))).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('POST', AllowedController)),
    ).resolves.toBe(true);
    expect(metrics.blockedWrites).toEqual([]);
  });

  it('AC 6, AC 20 (C24): a write of a barbershop in good standing passes and counts nothing', async () => {
    const guard = guardFor();

    await expect(guard.canActivate(contextFor('POST'))).resolves.toBe(true);
    expect(metrics.blockedWrites).toEqual([]);
  });

  it.each(['PUT', 'PATCH', 'DELETE', 'post'])(
    'AC 14: %s is a write',
    async (method) => {
      const guard = guardFor(SUSPENDED.trial_ended);

      await expect(guard.canActivate(contextFor(method))).rejects.toThrow(
        HttpException,
      );
    },
  );

  it('AC 16: a public route passes, with or without a session', async () => {
    const guard = guardFor(SUSPENDED.trial_ended);

    await expect(
      guard.canActivate(contextFor('POST', PublicController, undefined)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('POST', PublicController)),
    ).resolves.toBe(true);
  });
});
