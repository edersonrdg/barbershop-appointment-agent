import { randomUUID } from 'node:crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedSession } from '../../interface-adapters/controllers/authenticated-session';
import { Public } from '../../interface-adapters/controllers/public.decorator';
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
  const guard = new SessionGuard(new Reflector(), jwtService);
  const userId = randomUUID();
  const barbershopId = randomUUID();

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
});
