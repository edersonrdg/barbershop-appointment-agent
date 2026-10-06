import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_WHILE_SUSPENDED_KEY } from '../../interface-adapters/controllers/allow-while-suspended.decorator';
import { AuthenticatedSession } from '../../interface-adapters/controllers/authenticated-session';
import { IS_PUBLIC_KEY } from '../../interface-adapters/controllers/public.decorator';
import { GetSuspensionReasonUseCase } from '../../usecases/get-suspension-reason/get-suspension-reason.use-case';
import { PAYMENT_METRICS } from '../../usecases/ports/payment-metrics.port';
import type { PaymentMetrics } from '../../usecases/ports/payment-metrics.port';

export const SUSPENDED_WRITE_MESSAGE =
  'A assinatura desta barbearia está inativa. O painel está em modo leitura até a assinatura ser regularizada.';

export const READ_ONLY_WRITE_METHODS: readonly string[] = [
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
];

interface AccessRequest {
  method: string;
  session?: AuthenticatedSession;
}

// US-21 (CA-21.2, door 2): runs after the SessionGuard, so the tenant comes
// from the session. Every authenticated write is refused while the barbershop
// is suspended, unless its route says @AllowWhileSuspended().
@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly suspension: GetSuspensionReasonUseCase,
    @Inject(PAYMENT_METRICS) private readonly metrics: PaymentMetrics,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const exempt = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      targets,
    );
    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_WHILE_SUSPENDED_KEY,
      targets,
    );
    if (exempt || allowed) return true;

    const request = context.switchToHttp().getRequest<AccessRequest>();
    if (!READ_ONLY_WRITE_METHODS.includes(request.method.toUpperCase())) {
      return true;
    }
    if (!request.session) return true;

    const reason = await this.suspension.execute(request.session.barbershopId);
    if (!reason) return true;
    this.metrics.blockedWrite(reason);
    throw new HttpException(
      { message: SUSPENDED_WRITE_MESSAGE },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
