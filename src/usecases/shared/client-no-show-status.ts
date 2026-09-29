import { BookingRules } from '../../domain/value-objects/booking-rules';
import { BookingRulesRepository } from '../ports/booking-rules.repository.port';
import { NoShowLedger } from '../ports/no-show-ledger.port';

export interface ClientNoShowStatus {
  noShowCount: number;
  selfBookingBlocked: boolean;
}

// RN-12: the block follows the limit in force, read on every call (ATD-10); a
// barbershop without stored rules uses the defaults (AD-008).
export async function clientNoShowStatus(
  ledger: NoShowLedger,
  bookingRules: BookingRulesRepository,
  barbershopId: string,
  clientId: string,
): Promise<ClientNoShowStatus> {
  const rules =
    (await bookingRules.findByBarbershopId(barbershopId)) ??
    BookingRules.defaults();
  const noShowCount = await ledger.countFor(barbershopId, clientId);
  return {
    noShowCount,
    selfBookingBlocked: rules.blocksSelfBooking(noShowCount),
  };
}
