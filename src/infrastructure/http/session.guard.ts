import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import { UserRole } from '../../domain/entities/user';
import { AuthenticatedSession } from '../../interface-adapters/controllers/authenticated-session';
import { IS_PUBLIC_KEY } from '../../interface-adapters/controllers/public.decorator';
import {
  DEFAULT_ROLES,
  ROLES_KEY,
} from '../../interface-adapters/controllers/roles.decorator';
import { USER_REPOSITORY } from '../../usecases/ports/user.repository.port';
import type { UserRepository } from '../../usecases/ports/user.repository.port';

const sessionPayloadSchema = z.object({
  sub: z.uuid(),
  barbershopId: z.uuid(),
  role: z.enum(['owner', 'barber']),
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
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      targets,
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<SessionRequest>();
    // RN-26: the tenant comes only from the signed token; headers, query and
    // body are never read for it.
    const session = await this.sessionFrom(request.headers.authorization);

    const allowedRoles =
      this.reflector.getAllAndOverride<UserRole[] | undefined>(
        ROLES_KEY,
        targets,
      ) ?? DEFAULT_ROLES;
    if (!allowedRoles.includes(session.role)) {
      throw new ForbiddenException({ message: 'Acesso negado.' });
    }

    request.session = session;
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

    // AD-007: a removed user must lose access on the next request, and the
    // stored role wins over the one signed into the token.
    const user = await this.users.findById(
      payload.data.barbershopId,
      payload.data.sub,
    );
    if (!user) throw this.unauthorized();

    return {
      userId: user.id,
      barbershopId: user.barbershopId,
      role: user.role,
    };
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      message: 'Sessão inválida ou expirada.',
    });
  }
}
