import { JwtService } from '@nestjs/jwt';
import { JwtAccessTokenIssuer } from './jwt-access-token-issuer';

describe('JwtAccessTokenIssuer', () => {
  const secret = 'this-is-a-test-secret-with-32-chars';
  const ttlSeconds = 604800;
  const jwtService = new JwtService({
    secret,
    signOptions: { algorithm: 'HS256' },
  });
  const issuer = new JwtAccessTokenIssuer(jwtService, ttlSeconds);

  it('issues a token verifiable with the same secret carrying sub, barbershopId and role', async () => {
    const { accessToken } = await issuer.issue({
      userId: 'user-1',
      barbershopId: 'barbershop-1',
      role: 'owner',
    });

    const payload = await jwtService.verifyAsync<{
      sub: string;
      barbershopId: string;
      role: string;
      iat: number;
      exp: number;
    }>(accessToken, { secret, algorithms: ['HS256'] });

    expect(payload.sub).toBe('user-1');
    expect(payload.barbershopId).toBe('barbershop-1');
    expect(payload.role).toBe('owner');
    expect(payload.exp - payload.iat).toBe(ttlSeconds);
  });

  it('returns expiresIn equal to the configured TTL', async () => {
    const { expiresIn } = await issuer.issue({
      userId: 'user-1',
      barbershopId: 'barbershop-1',
      role: 'owner',
    });

    expect(expiresIn).toBe(ttlSeconds);
  });
});
