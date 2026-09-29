import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../../config/env.schema';

export const WEBHOOK_UNAUTHORIZED_MESSAGE = 'Webhook não autorizado.';

// Runs before the body is parsed by the validation pipe, so an unauthenticated
// caller never gets its payload read (AD-011).
@Injectable()
export class EvolutionWebhookGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(config: ConfigService<Env, true>) {
    const secret = config.get('WHATSAPP_WEBHOOK_SECRET', { infer: true });
    this.expected = digest(`Bearer ${secret}`);
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>()
      .headers.authorization;
    if (
      typeof header !== 'string' ||
      !timingSafeEqual(digest(header), this.expected)
    ) {
      throw new UnauthorizedException({
        message: WEBHOOK_UNAUTHORIZED_MESSAGE,
      });
    }
    return true;
  }
}

// Hashing both sides gives equal lengths, which timingSafeEqual requires.
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
