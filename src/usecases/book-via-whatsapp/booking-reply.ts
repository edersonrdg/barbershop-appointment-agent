import { BarbershopService } from '../../domain/entities/barbershop-service';
import { BarbershopTimezone } from '../../domain/value-objects/barbershop-timezone';
import { WEEKDAY_LABELS } from '../../domain/value-objects/weekday';
import {
  formatDuration,
  formatPrice,
} from '../answer-client-question/client-question-reply';
import { BookingPeriod } from '../ports/message-interpreter.port';
import { ScheduleEntry } from '../ports/schedule.query.port';

export interface LabeledSlot {
  barberName: string;
  startsAt: Date;
}

const PERIOD_LABELS: Record<BookingPeriod, string> = {
  morning: 'de manhã',
  afternoon: 'à tarde',
  evening: 'à noite',
};

export const UNKNOWN_OPTION_NOTICE = 'Não encontrei essa opção.';
export const SLOT_TAKEN_NOTICE = 'Esse horário acabou de ser ocupado.';
export const PAST_DATE_NOTICE = 'Essa data já passou.';
export const NO_UPCOMING_APPOINTMENT_TEXT =
  'Você não tem nenhum agendamento futuro.';

/** `quarta-feira, 30/09` for a local date `YYYY-MM-DD`. */
export function dateLabel(timezone: BarbershopTimezone, date: string): string {
  const [, month, day] = date.split('-');
  const weekday = WEEKDAY_LABELS[timezone.weekdayOf(date)];
  return `${weekday.toLocaleLowerCase('pt-BR')}, ${day}/${month}`;
}

export function serviceNames(
  services: readonly BarbershopService[],
  separator: string,
): string {
  return services.map((service) => service.name).join(separator);
}

/** The option as the client reads it, without its number. */
export function optionLabel(
  timezone: BarbershopTimezone,
  slot: LabeledSlot,
): string {
  const date = dateLabel(timezone, timezone.localDateOf(slot.startsAt));
  return `${date}, às ${timezone.localTimeOf(slot.startsAt)}, com ${slot.barberName}`;
}

export function offerText(
  timezone: BarbershopTimezone,
  services: readonly BarbershopService[],
  slots: readonly LabeledSlot[],
): string {
  const price = services.reduce((sum, service) => sum + service.priceCents, 0);
  const minutes = services.reduce(
    (sum, service) => sum + service.durationMinutes,
    0,
  );
  return [
    `Horários para ${serviceNames(services, ' + ')} (${formatPrice(price)}, ${formatDuration(minutes)}):`,
    ...slots.map(
      (slot, index) => `${index + 1}. ${optionLabel(timezone, slot)}`,
    ),
    'Responda com o número do horário que você quer.',
  ].join('\n');
}

export function bookedText({
  timezone,
  services,
  barberName,
  startsAt,
  address,
  heading = 'Agendamento confirmado!',
}: {
  timezone: BarbershopTimezone;
  services: readonly BarbershopService[];
  barberName: string;
  startsAt: Date;
  address: string | null;
  heading?: string;
}): string {
  const price = services.reduce((sum, service) => sum + service.priceCents, 0);
  const serviceLabel = services.length > 1 ? 'Serviços' : 'Serviço';
  return [
    heading,
    `${serviceLabel}: ${serviceNames(services, ', ')}`,
    `Barbeiro: ${barberName}`,
    `Data: ${dateLabel(timezone, timezone.localDateOf(startsAt))}`,
    `Horário: ${timezone.localTimeOf(startsAt)}`,
    `Valor: ${formatPrice(price)}`,
    `Endereço: ${address ?? 'ainda não informado'}`,
  ].join('\n');
}

// US-23: CA-23.1 gives "quer incluir barba por +R$20?".
export function addOnText(
  addOn: BarbershopService,
  services: readonly BarbershopService[],
): string {
  return `Quer incluir ${addOn.name} por +${formatPrice(addOn.priceCents)}? Responda "sim" para incluir ou "não" para seguir só com ${serviceNames(services, ' + ')}.`;
}

export function askServiceText(services: readonly BarbershopService[]): string {
  return `Qual serviço você quer agendar? Temos: ${serviceNames(services, ', ')}.`;
}

export function noServicesText(barbershopName: string): string {
  return `A ${barbershopName} ainda não tem serviços cadastrados.`;
}

export function askBarberText(
  services: readonly BarbershopService[],
  barberNames: readonly string[],
): string {
  return `Tem preferência de barbeiro? Fazem ${serviceNames(services, ' + ')}: ${barberNames.join(', ')}. Se não tiver, responda "tanto faz".`;
}

export function barberNotAptText(
  barberName: string,
  services: readonly BarbershopService[],
  barberNames: readonly string[],
): string {
  const names = serviceNames(services, ' + ');
  return `${barberName} não faz ${names}. Fazem ${names}: ${barberNames.join(', ')}. Se não tiver preferência, responda "tanto faz".`;
}

export function noBarberText(services: readonly BarbershopService[]): string {
  return `Nenhum barbeiro faz ${serviceNames(services, ' + ')} no momento.`;
}

export function minimumAdvanceText(minutes: number): string {
  return `Só agendamos pelo WhatsApp com pelo menos ${formatDuration(minutes)} de antecedência.`;
}

export function timeTakenText(
  timezone: BarbershopTimezone,
  date: string,
  time: string,
): string {
  return `O horário das ${time} de ${dateLabel(timezone, date)} não está livre.`;
}

export function emptyDateText(
  timezone: BarbershopTimezone,
  date: string,
  period: BookingPeriod | null,
): string {
  const when = period ? `${PERIOD_LABELS[period]} ` : '';
  return `Não há horário livre ${when}em ${dateLabel(timezone, date)}.`;
}

export function nothingFreeText(
  timezone: BarbershopTimezone,
  services: readonly BarbershopService[],
  lastDate: string,
): string {
  return `Não encontrei horário livre para ${serviceNames(services, ' + ')} até ${dateLabel(timezone, lastDate)}.`;
}

/** The appointment as the client reads it in the list, without its number. */
export function appointmentLabel(
  timezone: BarbershopTimezone,
  entry: ScheduleEntry,
): string {
  const services = entry.services.map((service) => service.name).join(' + ');
  return `${services}, ${optionLabel(timezone, { barberName: entry.barber.name, startsAt: entry.startsAt })}`;
}

export function appointmentListText(
  timezone: BarbershopTimezone,
  entries: readonly ScheduleEntry[],
): string {
  return [
    'Você tem mais de um agendamento. Qual deles?',
    ...entries.map(
      (entry, index) => `${index + 1}. ${appointmentLabel(timezone, entry)}`,
    ),
    'Responda com o número do agendamento.',
  ].join('\n');
}

export function cancelledText(
  timezone: BarbershopTimezone,
  entry: ScheduleEntry,
): string {
  const serviceLabel = entry.services.length > 1 ? 'Serviços' : 'Serviço';
  return [
    'Agendamento cancelado.',
    `${serviceLabel}: ${entry.services.map((service) => service.name).join(', ')}`,
    `Barbeiro: ${entry.barber.name}`,
    `Data: ${dateLabel(timezone, timezone.localDateOf(entry.startsAt))}`,
    `Horário: ${timezone.localTimeOf(entry.startsAt)}`,
  ].join('\n');
}

export function cancellationDeadlineText(minutes: number): string {
  return `Só cancelamos ou remarcamos pelo WhatsApp com pelo menos ${formatDuration(minutes)} de antecedência.`;
}

export const WAITLIST_OFFER_EXPIRED_TEXT =
  'O prazo para aceitar esse horário acabou. Você continua na lista de espera.';
export const WAITLIST_OFFER_DECLINED_TEXT =
  'Tudo bem, você continua na lista de espera.';

/** US-24: `Corte à tarde em quarta-feira, 30/09`, as the client reads it. */
export function waitlistLabel(
  timezone: BarbershopTimezone,
  services: readonly BarbershopService[],
  window: { startsOn: string; endsOn: string; period: BookingPeriod | null },
): string {
  const period = window.period ? `${PERIOD_LABELS[window.period]} ` : '';
  const when =
    window.startsOn === window.endsOn
      ? `em ${dateLabel(timezone, window.startsOn)}`
      : `até ${dateLabel(timezone, window.endsOn)}`;
  return `${serviceNames(services, ' + ')} ${period}${when}`;
}

export function waitlistProposalText(label: string): string {
  return `Se preferir, posso te colocar na lista de espera para ${label} e te aviso se vagar um horário. Responda "lista de espera" para entrar.`;
}

export function waitlistJoinedText(label: string): string {
  return `Pronto! Você está na lista de espera para ${label}. Se vagar um horário, eu te aviso por aqui.`;
}

export function waitlistOfferText(
  timezone: BarbershopTimezone,
  services: readonly BarbershopService[],
  slot: LabeledSlot,
  deadlineMinutes: number,
): string {
  const price = services.reduce((sum, service) => sum + service.priceCents, 0);
  const minutes = services.reduce(
    (sum, service) => sum + service.durationMinutes,
    0,
  );
  return `Vagou um horário: ${serviceNames(services, ' + ')}, ${optionLabel(timezone, slot)} (${formatPrice(price)}, ${formatDuration(minutes)}). Responda "sim" em até ${formatDuration(deadlineMinutes)} para agendar ou "não" para recusar.`;
}
