import { randomUUID } from 'node:crypto';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedSession } from '../../interface-adapters/controllers/authenticated-session';
import { User, UserRole } from '../../domain/entities/user';
import { Public } from '../../interface-adapters/controllers/public.decorator';
import { Roles } from '../../interface-adapters/controllers/roles.decorator';
import { InMemoryAccountStore } from '../../usecases/testing/in-memory-account-store';
import { InMemoryUserRepository } from '../../usecases/testing/in-memory-user.repository';
import { SessionGuard } from './session.guard';

const SECRET = 'this-is-a-test-secret-with-32-chars';

class ProtectedController {
  handler(): void {}
}

class MixedController {
  @Public()
  handler(): void {}
}

@Public()
class PublicController {
  handler(): void {}
}

class SharedHandlerController {
  @Roles('owner', 'barber')
  handler(): void {}
}

@Roles('owner', 'barber')
class SharedController {
  handler(): void {}
}

interface FakeRequest {
  headers: Record<string, string | undefined>;
  query?: Record<string, string>;
  body?: Record<string, string>;
  session?: AuthenticatedSession;
}

function contextFor(
  request: FakeRequest,
  controller: {
    prototype: { handler: () => void };
  } = ProtectedController,
): ExecutionContext {
  return {
    getHandler: () => controller.prototype.handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SessionGuard', () => {
  const jwtService = new JwtService({
    secret: SECRET,
    signOptions: { algorithm: 'HS256' },
  });
  const userId = randomUUID();
  const barberId = randomUUID();
  const barbershopId = randomUUID();
  const store = new InMemoryAccountStore();
  store.users.push(
    User.createOwner({
      id: userId,
      barbershopId,
      name: 'Ana',
      email: 'ana@exemplo.com',
      phone: '+5511912345678',
      passwordHash: 'hash',
      now: new Date(),
    }),
    User.createBarber({
      id: barberId,
      barbershopId,
      name: 'João',
      email: 'joao@exemplo.com',
      passwordHash: 'hash',
      now: new Date(),
    }),
  );
  const guard = new SessionGuard(
    new Reflector(),
    jwtService,
    new InMemoryUserRepository(store),
  );

  function sign(payload: object, secret = SECRET, expiresIn = 3600) {
    return jwtService.signAsync(payload, { secret, expiresIn });
  }

  async function expectUnauthorized(request: FakeRequest): Promise<void> {
    const attempt = guard.canActivate(contextFor(request));
    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(attempt).rejects.toMatchObject({
      response: { message: 'Sessão inválida ou expirada.' },
      status: 401,
    });
    expect(request.session).toBeUndefined();
  }

  it('lets a @Public() handler through without a token', async () => {
    const request: FakeRequest = { headers: {} };

    await expect(
      guard.canActivate(contextFor(request, MixedController)),
    ).resolves.toBe(true);
    expect(request.session).toBeUndefined();
  });

  it('lets a handler of a @Public() controller through without a token', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: {} }, PublicController)),
    ).resolves.toBe(true);
  });

  it('rejects a request without the Authorization header', async () => {
    await expectUnauthorized({ headers: {} });
  });

  it('rejects a scheme other than Bearer', async () => {
    const token = await sign({ sub: userId, barbershopId, role: 'owner' });

    await expectUnauthorized({ headers: { authorization: `Basic ${token}` } });
  });

  it('rejects a token signed with another secret', async () => {
    const token = await sign(
      { sub: userId, barbershopId, role: 'owner' },
      'another-secret-with-at-least-32-chars',
    );

    await expectUnauthorized({ headers: { authorization: `Bearer ${token}` } });
  });

  it('rejects an expired token', async () => {
    const token = await sign(
      { sub: userId, barbershopId, role: 'owner' },
      SECRET,
      -10,
    );

    await expectUnauthorized({ headers: { authorization: `Bearer ${token}` } });
  });

  it('rejects a token whose payload has no barbershopId', async () => {
    const token = await sign({ sub: userId, role: 'owner' });

    await expectUnauthorized({ headers: { authorization: `Bearer ${token}` } });
  });

  it('CA-01.4: a valid token sets request.session with userId, barbershopId and role from the token only', async () => {
    const token = await sign({ sub: userId, barbershopId, role: 'owner' });
    const otherBarbershopId = randomUUID();
    const request: FakeRequest = {
      headers: {
        authorization: `Bearer ${token}`,
        'x-barbershop-id': otherBarbershopId,
      },
      query: { barbershopId: otherBarbershopId },
      body: { barbershopId: otherBarbershopId },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.session).toEqual({ userId, barbershopId, role: 'owner' });
  });

  async function requestAs(sub: string, role: UserRole): Promise<FakeRequest> {
    const token = await sign({ sub, barbershopId, role });
    return { headers: { authorization: `Bearer ${token}` } };
  }

  it('CA-02.2: denies a barber on a handler without @Roles (C18)', async () => {
    const request = await requestAs(barberId, 'barber');

    const attempt = guard.canActivate(contextFor(request));
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toMatchObject({
      response: { message: 'Acesso negado.' },
      status: 403,
    });
  });

  it('CA-02.2: lets a barber through a handler marked @Roles(owner, barber) (C18)', async () => {
    const request = await requestAs(barberId, 'barber');

    await expect(
      guard.canActivate(contextFor(request, SharedHandlerController)),
    ).resolves.toBe(true);
    expect(request.session).toEqual({
      userId: barberId,
      barbershopId,
      role: 'barber',
    });
  });

  it('CA-02.2: applies @Roles on the class to its handlers (C18)', async () => {
    const request = await requestAs(barberId, 'barber');

    await expect(
      guard.canActivate(contextFor(request, SharedController)),
    ).resolves.toBe(true);
  });

  it('CA-02.3: rejects a valid token whose user no longer exists in the barbershop (C31)', async () => {
    await expectUnauthorized(await requestAs(randomUUID(), 'owner'));
  });

  it('CA-02.3: rejects a token whose user exists only in another barbershop (C31)', async () => {
    const token = await sign({
      sub: userId,
      barbershopId: randomUUID(),
      role: 'owner',
    });

    await expectUnauthorized({ headers: { authorization: `Bearer ${token}` } });
  });

  it('CA-02.2: stores the role from the database, not the one in the token (C31)', async () => {
    const barberClaimingOwner = await requestAs(barberId, 'owner');
    await expect(
      guard.canActivate(contextFor(barberClaimingOwner)),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const ownerClaimingBarber = await requestAs(userId, 'barber');
    await expect(
      guard.canActivate(contextFor(ownerClaimingBarber)),
    ).resolves.toBe(true);
    expect(ownerClaimingBarber.session).toEqual({
      userId,
      barbershopId,
      role: 'owner',
    });
  });

  it('CA-02.2: rejects a token whose role is neither owner nor barber', async () => {
    await expectUnauthorized(
      await requestAs(userId, 'admin' as unknown as UserRole),
    );
  });
});
