import { Barbershop } from '../../domain/entities/barbershop';
import { SuspensionReason } from '../../domain/entities/barbershop-subscription';
import { User } from '../../domain/entities/user';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { GetSuspensionReasonUseCase } from '../get-suspension-reason/get-suspension-reason.use-case';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { UserRepository } from '../ports/user.repository.port';

export interface GetMyAccountInput {
  barbershopId: string;
  userId: string;
}

export interface MyAccount {
  user: User;
  barbershop: Barbershop;
  /** US-21 (CA-21.2): why the panel is read-only, for Owner and Barber alike. */
  suspensionReason: SuspensionReason | null;
}

export class GetMyAccountUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly barbershops: BarbershopRepository,
    private readonly suspension: GetSuspensionReasonUseCase,
  ) {}

  async execute(input: GetMyAccountInput): Promise<MyAccount> {
    const user = await this.users.findById(input.barbershopId, input.userId);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) {
      throw new InvalidCredentialsError();
    }

    return {
      user,
      barbershop,
      suspensionReason: await this.suspension.execute(input.barbershopId),
    };
  }
}
