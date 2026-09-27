import { Barbershop } from '../../domain/entities/barbershop';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { BarbershopRepository } from '../ports/barbershop.repository.port';

export interface GetBarbershopSettingsInput {
  barbershopId: string;
}

export class GetBarbershopSettingsUseCase {
  constructor(private readonly barbershops: BarbershopRepository) {}

  async execute(input: GetBarbershopSettingsInput): Promise<Barbershop> {
    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) {
      throw new InvalidCredentialsError();
    }
    return barbershop;
  }
}
