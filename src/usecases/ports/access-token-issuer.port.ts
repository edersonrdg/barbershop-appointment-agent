import { UserRole } from '../../domain/entities/user';

export const ACCESS_TOKEN_ISSUER = Symbol('AccessTokenIssuer');

export interface AccessTokenClaims {
  userId: string;
  barbershopId: string;
  role: UserRole;
}

export interface IssuedAccessToken {
  accessToken: string;
  expiresIn: number;
}

export interface AccessTokenIssuer {
  issue(claims: AccessTokenClaims): Promise<IssuedAccessToken>;
}
