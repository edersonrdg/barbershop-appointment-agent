import { UserRole } from '../../domain/entities/user';
import { BarberBlockNotFoundError } from '../../domain/errors/barber-block-not-found.error';
import { BarberBlockRepository } from '../ports/barber-block.repository.port';
import { BarberAccessPolicy } from '../shared/barber-access-policy';

export interface RemoveBarberBlockInput {
  barbershopId: string;
  userId: string;
  role: UserRole;
  blockId: string;
}

export class RemoveBarberBlockUseCase {
  constructor(
    private readonly access: BarberAccessPolicy,
    private readonly blocks: BarberBlockRepository,
  ) {}

  async execute(input: RemoveBarberBlockInput): Promise<void> {
    const block = await this.blocks.findById(input.barbershopId, input.blockId);
    if (!block) {
      throw new BarberBlockNotFoundError();
    }
    await this.access.assertCanManage({ ...input, barberId: block.barberId });
    await this.blocks.delete(input.barbershopId, block.id);
  }
}
