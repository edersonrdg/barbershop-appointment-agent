import { JwtService } from '@nestjs/jwt';
import {
  AccessTokenClaims,
  AccessTokenIssuer,
  IssuedAccessToken,
} from '../../usecases/ports/access-token-issuer.port';

export class JwtAccessTokenIssuer implements AccessTokenIssuer {
  constructor(
    private readonly jwtService: JwtService,
    private readonly ttlSeconds: number,
  ) {}

  async issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: claims.userId,
        barbershopId: claims.barbershopId,
        role: claims.role,
      },
      { expiresIn: this.ttlSeconds },
    );

    return { accessToken, expiresIn: this.ttlSeconds };
  }
}
