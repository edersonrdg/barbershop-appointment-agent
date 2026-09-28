import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BookingRulesController } from '../../interface-adapters/controllers/booking-rules.controller';
import { GetBookingRulesUseCase } from '../../usecases/get-booking-rules/get-booking-rules.use-case';
import {
  BOOKING_RULES_REPOSITORY,
  BookingRulesRepository,
} from '../../usecases/ports/booking-rules.repository.port';
import { UpdateBookingRulesUseCase } from '../../usecases/update-booking-rules/update-booking-rules.use-case';
import { TypeOrmBookingRulesRepository } from '../database/repositories/typeorm-booking-rules.repository';

@Module({
  controllers: [BookingRulesController],
  providers: [
    {
      provide: BOOKING_RULES_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new TypeOrmBookingRulesRepository(dataSource),
    },
    {
      provide: GetBookingRulesUseCase,
      inject: [BOOKING_RULES_REPOSITORY],
      useFactory: (bookingRules: BookingRulesRepository) =>
        new GetBookingRulesUseCase(bookingRules),
    },
    {
      provide: UpdateBookingRulesUseCase,
      inject: [BOOKING_RULES_REPOSITORY],
      useFactory: (bookingRules: BookingRulesRepository) =>
        new UpdateBookingRulesUseCase(bookingRules),
    },
  ],
})
export class BookingRulesModule {}
