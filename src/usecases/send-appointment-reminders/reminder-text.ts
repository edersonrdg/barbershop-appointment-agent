import { Barbershop } from '../../domain/entities/barbershop';
import { ReminderKind } from '../../domain/value-objects/appointment-reminder';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { dateLabel } from '../book-via-whatsapp/booking-reply';
import { ScheduleEntry } from '../ports/schedule.query.port';

// CA-19.1: the 24h reminder offers to confirm, reschedule or cancel. It never
// says "amanhã", since a late reminder may go out on the same day.
function dayBeforeText(
  barbershop: Barbershop,
  timezone: BarbershopTimezone,
  entry: ScheduleEntry,
): string {
  const serviceLabel = entry.services.length > 1 ? 'Serviços' : 'Serviço';
  return [
    `Lembrete do seu horário na ${barbershop.name}:`,
    `${serviceLabel}: ${entry.services.map((service) => service.name).join(', ')}`,
    `Barbeiro: ${entry.barber.name}`,
    `Data: ${dateLabel(timezone, timezone.localDateOf(entry.startsAt))}`,
    `Horário: ${timezone.localTimeOf(entry.startsAt)}`,
    '',
    'Responda *confirmar* para confirmar presença, *remarcar* para trocar o horário ou *cancelar* para desmarcar.',
  ].join('\n');
}

function hourBeforeText(
  barbershop: Barbershop,
  timezone: BarbershopTimezone,
  entry: ScheduleEntry,
): string {
  return `Seu horário na ${barbershop.name} é hoje às ${timezone.localTimeOf(entry.startsAt)}, com ${entry.barber.name}. Até já!`;
}

export function reminderText(
  kind: ReminderKind,
  barbershop: Barbershop,
  entry: ScheduleEntry,
): string {
  const timezone = BarbershopTimezone.create(barbershop.timezone);
  return kind === '24h'
    ? dayBeforeText(barbershop, timezone, entry)
    : hourBeforeText(barbershop, timezone, entry);
}
