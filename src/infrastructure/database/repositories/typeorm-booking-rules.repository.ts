import { DataSource } from 'typeorm';
import { BookingRules } from '../../../domain/value-objects/booking-rules';
import { BookingRulesRepository } from '../../../usecases/ports/booking-rules.repository.port';
import { BarbershopBookingRulesEntity } from '../entities/barbershop-booking-rules.entity';

export class TypeOrmBookingRulesRepository implements BookingRulesRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findByBarbershopId(barbershopId: string): Promise<BookingRules | null> {
    const row = await this.dataSource
      .getRepository(BarbershopBookingRulesEntity)
      .findOneBy({ barbershopId });
    if (!row) return null;
    return BookingRules.create({
      minimumAdvanceMinutes: row.minimumAdvanceMinutes,
      cancellationDeadlineMinutes: row.cancellationDeadlineMinutes,
      noShowLimit: row.noShowLimit,
      waitlistOfferMinutes: row.waitlistOfferMinutes,
      returnReminderDays: row.returnReminderDays,
    });
  }

  async save(barbershopId: string, rules: BookingRules): Promise<void> {
    await this.dataSource
      .getRepository(BarbershopBookingRulesEntity)
      .update({ barbershopId }, toColumns(rules));
  }
}

export function toColumns(
  rules: BookingRules,
): Omit<BarbershopBookingRulesEntity, 'barbershopId'> {
  return {
    minimumAdvanceMinutes: rules.minimumAdvanceMinutes,
    cancellationDeadlineMinutes: rules.cancellationDeadlineMinutes,
    noShowLimit: rules.noShowLimit,
    waitlistOfferMinutes: rules.waitlistOfferMinutes,
    returnReminderDays: rules.returnReminderDays,
  };
}
