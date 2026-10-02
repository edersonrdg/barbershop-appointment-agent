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
import { WEBHOOK_UNAUTHORIZED_MESSAGE } from '../../whatsapp/evolution/evolution-webhook.guard';

export const ASAAS_TOKEN_HEADER = 'asaas-access-token';

// US-20 (door 5): runs before the body is parsed, so an unauthenticated caller
// never gets its payload read.
@Injectable()
export class AsaasWebhookGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.expected = digest(config.get('ASAAS_WEBHOOK_TOKEN', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers[
      ASAAS_TOKEN_HEADER
    ];
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
