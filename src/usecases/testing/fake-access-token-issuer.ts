import {
  AccessTokenClaims,
  AccessTokenIssuer,
  IssuedAccessToken,
} from '../ports/access-token-issuer.port';

export const FAKE_TOKEN_TTL_SECONDS = 604800;

export class FakeAccessTokenIssuer implements AccessTokenIssuer {
  readonly issued: AccessTokenClaims[] = [];

  issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    this.issued.push(claims);
    return Promise.resolve({
      accessToken: `token(${claims.userId}|${claims.barbershopId}|${claims.role})`,
      expiresIn: FAKE_TOKEN_TTL_SECONDS,
    });
  }
}
