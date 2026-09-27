import { User } from '../../domain/entities/user';
import { EmailAlreadyRegisteredError } from '../../domain/errors/email-already-registered.error';
import { InvalidInvitationError } from '../../domain/errors/invalid-invitation.error';
import {
  AccessTokenIssuer,
  IssuedAccessToken,
} from '../ports/access-token-issuer.port';
import { Clock } from '../ports/clock.port';
import { IdGenerator } from '../ports/id-generator.port';
import { PasswordHasher } from '../ports/password-hasher.port';
import { ResetTokenGenerator } from '../ports/reset-token-generator.port';
import { UserInvitationRepository } from '../ports/user-invitation.repository.port';
import { UserRepository } from '../ports/user.repository.port';

export interface AcceptInvitationInput {
  token: string;
  password: string;
}

export class AcceptInvitationUseCase {
  constructor(
    private readonly invitations: UserInvitationRepository,
    private readonly users: UserRepository,
    private readonly tokenGenerator: ResetTokenGenerator,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokenIssuer: AccessTokenIssuer,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: AcceptInvitationInput): Promise<IssuedAccessToken> {
    const now = this.clock.now();
    const invitation = await this.invitations.findByTokenHash(
      this.tokenGenerator.hashOf(input.token),
    );
    if (!invitation || !invitation.isAcceptable(now)) {
      throw new InvalidInvitationError();
    }
    if (await this.users.findByEmail(invitation.email)) {
      throw new EmailAlreadyRegisteredError();
    }

    const barber = User.createBarber({
      id: this.idGenerator.next(),
      barbershopId: invitation.barbershopId,
      name: invitation.name,
      email: invitation.email,
      passwordHash: await this.passwordHasher.hash(input.password),
      now,
    });
    const accepted = await this.invitations.accept({
      invitation,
      user: barber,
      acceptedAt: now,
    });
    if (!accepted) {
      throw new InvalidInvitationError();
    }

    return this.accessTokenIssuer.issue({
      userId: barber.id,
      barbershopId: barber.barbershopId,
      role: barber.role,
    });
  }
}
