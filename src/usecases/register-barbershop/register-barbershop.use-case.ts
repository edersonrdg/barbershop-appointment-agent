import { Barbershop } from '../../domain/entities/barbershop';
import { User } from '../../domain/entities/user';
import { Email } from '../../domain/value-objects/email';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import {
  AccessTokenIssuer,
  IssuedAccessToken,
} from '../ports/access-token-issuer.port';
import { AccountMetrics } from '../ports/account-metrics.port';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { Clock } from '../ports/clock.port';
import { IdGenerator } from '../ports/id-generator.port';
import { PasswordHasher } from '../ports/password-hasher.port';

export interface RegisterBarbershopInput {
  barbershopName: string;
  ownerName: string;
  email: string;
  phone: string;
  password: string;
}

export class RegisterBarbershopUseCase {
  constructor(
    private readonly barbershops: BarbershopRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokenIssuer: AccessTokenIssuer,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly metrics: AccountMetrics,
  ) {}

  async execute(input: RegisterBarbershopInput): Promise<IssuedAccessToken> {
    const now = this.clock.now();
    const email = Email.create(input.email);
    const phone = PhoneNumber.create(input.phone);
    const passwordHash = await this.passwordHasher.hash(input.password);

    const barbershop = Barbershop.startTrial({
      id: this.idGenerator.next(),
      name: input.barbershopName,
      now,
    });
    const owner = User.createOwner({
      id: this.idGenerator.next(),
      barbershopId: barbershop.id,
      name: input.ownerName,
      email: email.value,
      phone: phone.value,
      passwordHash,
      now,
    });

    await this.barbershops.createWithOwner(barbershop, owner);
    this.metrics.signupCompleted();

    return this.accessTokenIssuer.issue({
      userId: owner.id,
      barbershopId: barbershop.id,
      role: owner.role,
    });
  }
}
