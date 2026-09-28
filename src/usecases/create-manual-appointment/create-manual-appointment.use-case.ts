import { Appointment } from '../../domain/entities/appointment';
import { Client } from '../../domain/entities/client';
import { ClientPhoneTakenError } from '../../domain/errors/client-phone-taken.error';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { BookAppointmentUseCase } from '../book-appointment/book-appointment.use-case';
import { ClientRepository } from '../ports/client.repository.port';
import { Clock } from '../ports/clock.port';
import { IdGenerator } from '../ports/id-generator.port';
import { ScheduleEntry, ScheduleQuery } from '../ports/schedule.query.port';
import {
  BarberAccessPolicy,
  BarberAccessRequest,
} from '../shared/barber-access-policy';

export type CreateManualAppointmentInput = BarberAccessRequest & {
  barberId: string;
  serviceIds: readonly string[];
  startsAt: Date;
  client: { name: string; phone: string };
};

export class CreateManualAppointmentUseCase {
  constructor(
    private readonly access: BarberAccessPolicy,
    private readonly clients: ClientRepository,
    private readonly book: BookAppointmentUseCase,
    private readonly schedule: ScheduleQuery,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateManualAppointmentInput): Promise<ScheduleEntry> {
    const barber = await this.access.targetBarber(input);
    const phone = PhoneNumber.create(input.client.phone);
    const appointment = await this.bookFor(input, barber.id, phone).catch(
      (error: unknown) => {
        // RN-08: another request stored the same new phone between the lookup
        // and the insert; the second lookup finds that client. One retry only.
        if (!(error instanceof ClientPhoneTakenError)) throw error;
        return this.bookFor(input, barber.id, phone);
      },
    );
    const entry = await this.schedule.findById(
      input.barbershopId,
      appointment.id,
    );
    if (!entry) {
      throw new Error('The booked appointment was not found.');
    }
    return entry;
  }

  private async bookFor(
    input: CreateManualAppointmentInput,
    barberId: string,
    phone: PhoneNumber,
  ): Promise<Appointment> {
    const client = await this.resolveClient(input, phone);
    return this.book.execute({
      barbershopId: input.barbershopId,
      barberId,
      serviceIds: input.serviceIds,
      startsAt: input.startsAt,
      origin: 'manual',
      client,
    });
  }

  // CA-10.2: the phone identifies the client; an existing client keeps the
  // stored name even when another one is typed.
  private async resolveClient(
    input: CreateManualAppointmentInput,
    phone: PhoneNumber,
  ): Promise<{ client: Client; isNew: boolean }> {
    const existing = await this.clients.findByPhone(
      input.barbershopId,
      phone.value,
    );
    if (existing) {
      return { client: existing, isNew: false };
    }
    const client = Client.create({
      id: this.ids.next(),
      barbershopId: input.barbershopId,
      name: input.client.name,
      phone,
      now: this.clock.now(),
    });
    return { client, isNew: true };
  }
}
