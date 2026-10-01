import { Barbershop } from '../../domain/entities/barbershop';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { appointmentLabel } from '../book-via-whatsapp/booking-reply';
import { AppointmentRepository } from '../ports/appointment.repository.port';
import { ScheduleQuery } from '../ports/schedule.query.port';

export const NOTHING_TO_CONFIRM_TEXT =
  'Você não tem nenhum agendamento aguardando confirmação.';

export interface PresenceConfirmation {
  kind: 'presence_confirmed' | 'nothing_to_confirm';
  text: string;
  /** How many appointments this message confirmed for the first time. */
  confirmed: number;
}

// US-19 (CA-19.2): "confirmar" confirms every upcoming appointment of the
// client that got the 24h reminder; confirming again changes nothing.
export class ConfirmPresenceViaWhatsAppUseCase {
  constructor(
    private readonly schedule: ScheduleQuery,
    private readonly appointments: AppointmentRepository,
  ) {}

  async execute({
    barbershop,
    clientId,
    now,
  }: {
    barbershop: Barbershop;
    clientId: string;
    now: Date;
  }): Promise<PresenceConfirmation> {
    const reminded = (
      await this.schedule.listForClient(barbershop.id, clientId, null)
    ).filter(
      (entry) =>
        entry.status === 'confirmed' &&
        entry.startsAt > now &&
        entry.reminder24hSentAt !== null,
    );
    if (reminded.length === 0) {
      return {
        kind: 'nothing_to_confirm',
        text: NOTHING_TO_CONFIRM_TEXT,
        confirmed: 0,
      };
    }
    let confirmed = 0;
    for (const entry of reminded) {
      if (
        await this.appointments.confirmByClient(barbershop.id, entry.id, now)
      ) {
        confirmed += 1;
      }
    }
    const timezone = BarbershopTimezone.create(barbershop.timezone);
    return {
      kind: 'presence_confirmed',
      text: [
        'Presença confirmada!',
        ...reminded.map((entry) => appointmentLabel(timezone, entry)),
      ].join('\n'),
      confirmed,
    };
  }
}
