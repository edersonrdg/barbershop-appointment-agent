import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import { AuthenticatedSession } from '../../interface-adapters/controllers/authenticated-session';
import { IS_PUBLIC_KEY } from '../../interface-adapters/controllers/public.decorator';

const sessionPayloadSchema = z.object({
  sub: z.uuid(),
  barbershopId: z.uuid(),
  role: z.literal('owner'),
});

interface SessionRequest {
  headers: { authorization?: string };
  session?: AuthenticatedSession;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<SessionRequest>();
    // RN-26: the tenant comes only from the signed token; headers, query and
    // body are never read for it.
    request.session = await this.sessionFrom(request.headers.authorization);
    return true;
  }

  private async sessionFrom(
    authorization: string | undefined,
  ): Promise<AuthenticatedSession> {
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw this.unauthorized();

    let claims: unknown;
    try {
      claims = await this.jwtService.verifyAsync<object>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw this.unauthorized();
    }

    const payload = sessionPayloadSchema.safeParse(claims);
    if (!payload.success) throw this.unauthorized();

    return {
      userId: payload.data.sub,
      barbershopId: payload.data.barbershopId,
      role: payload.data.role,
    };
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      message: 'Sessão inválida ou expirada.',
    });
  }
}
