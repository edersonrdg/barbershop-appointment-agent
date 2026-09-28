import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import {
  BookingRules,
  BookingRulesProps,
} from '../../domain/value-objects/booking-rules';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';

export interface UpdateBookingRulesInput extends BookingRulesProps {
  barbershopId: string;
}

// CA-06.2: grava só as regras. Cada ação futura lê a regra vigente quando
// acontece, então nenhum agendamento já criado muda.
export class UpdateBookingRulesUseCase {
  constructor(private readonly bookingRules: BookingRulesRepository) {}

  async execute(input: UpdateBookingRulesInput): Promise<BookingRules> {
    const { barbershopId, ...props } = input;
    const rules = BookingRules.create(props);

    const current = await this.bookingRules.findByBarbershopId(barbershopId);
    if (!current) {
      throw new InvalidCredentialsError();
    }

    await this.bookingRules.save(barbershopId, rules);
    return rules;
  }
}
