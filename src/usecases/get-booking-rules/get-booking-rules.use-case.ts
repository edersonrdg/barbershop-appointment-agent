import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';

export interface GetBookingRulesInput {
  barbershopId: string;
}

export class GetBookingRulesUseCase {
  constructor(private readonly bookingRules: BookingRulesRepository) {}

  async execute(input: GetBookingRulesInput): Promise<BookingRules> {
    const rules = await this.bookingRules.findByBarbershopId(
      input.barbershopId,
    );
    if (!rules) {
      throw new InvalidCredentialsError();
    }
    return rules;
  }
}
