import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { Email } from '../../domain/value-objects/email';
import {
  AccessTokenIssuer,
  IssuedAccessToken,
} from '../ports/access-token-issuer.port';
import { PasswordHasher } from '../ports/password-hasher.port';
import { UserRepository } from '../ports/user.repository.port';

export interface AuthenticateUserInput {
  email: string;
  password: string;
}

export class AuthenticateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokenIssuer: AccessTokenIssuer,
  ) {}

  async execute(input: AuthenticateUserInput): Promise<IssuedAccessToken> {
    // Every failure gets the same error so the response never reveals which
    // e-mails are registered.
    if (!Email.isValid(input.email)) {
      throw new InvalidCredentialsError();
    }

    const user = await this.users.findByEmail(Email.create(input.email).value);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const matches = await this.passwordHasher.verify(
      input.password,
      user.passwordHash,
    );
    if (!matches) {
      throw new InvalidCredentialsError();
    }

    return this.accessTokenIssuer.issue({
      userId: user.id,
      barbershopId: user.barbershopId,
      role: user.role,
    });
  }
}
