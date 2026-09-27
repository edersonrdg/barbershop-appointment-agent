import { IssuedAccessToken } from '../../usecases/ports/access-token-issuer.port';

export interface SessionResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export class SessionPresenter {
  static toResponse(session: IssuedAccessToken): SessionResponse {
    return {
      accessToken: session.accessToken,
      tokenType: 'Bearer',
      expiresIn: session.expiresIn,
    };
  }
}
