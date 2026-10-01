import { Barbershop } from '../../domain/entities/barbershop';
import { BarbershopService } from '../../domain/entities/barbershop-service';
import { WEEKDAY_LABELS, WEEKDAYS } from '../../domain/value-objects/weekday';
import { MessageInterpretation } from '../ports/message-interpreter.port';
import { ClientReplyKind } from '../ports/whatsapp-metrics.port';

export interface ClientQuestionReply {
  kind: ClientReplyKind;
  text: string;
}

export const UNAVAILABLE_REPLY =
  'Desculpe, não consegui responder agora. Tente de novo em alguns instantes.';

const THOUSANDS_PATTERN = /\B(?=(\d{3})+(?!\d))/g;

export function formatPrice(cents: number): string {
  const reais = Math.floor(cents / 100)
    .toString()
    .replace(THOUSANDS_PATTERN, '.');
  const centavos = (cents % 100).toString().padStart(2, '0');
  return `R$ ${reais},${centavos}`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h${rest.toString().padStart(2, '0')}`;
}

// RF-09: every price, duration, address and hour comes from the barbershop's
// data; from the model only the topics and the names it matched are used.
export function composeReply(
  barbershop: Barbershop,
  services: readonly BarbershopService[],
  interpretation: MessageInterpretation,
): ClientQuestionReply {
  if (interpretation.offTopic) {
    return {
      kind: 'off_topic',
      text: `Desculpe, só posso ajudar com assuntos da ${barbershop.name}: serviços, preços, endereço e horário de funcionamento.`,
    };
  }
  const blocks: string[] = [];
  if (interpretation.topics.includes('services')) {
    blocks.push(servicesBlock(barbershop.name, services, interpretation));
  }
  if (interpretation.topics.includes('address')) {
    blocks.push(addressBlock(barbershop));
  }
  if (interpretation.topics.includes('opening_hours')) {
    blocks.push(openingHoursBlock(barbershop));
  }
  if (blocks.length === 0) return fallbackReply(barbershop);
  return { kind: 'answer', text: blocks.join('\n\n') };
}

export function fallbackReply(barbershop: Barbershop): ClientQuestionReply {
  return {
    kind: 'fallback',
    text: `Posso te ajudar com serviços, preços, endereço e horário de funcionamento da ${barbershop.name}. O que você gostaria de saber?`,
  };
}

function servicesBlock(
  barbershopName: string,
  services: readonly BarbershopService[],
  { services: named, unknownServices }: MessageInterpretation,
): string {
  if (services.length === 0) {
    return `A ${barbershopName} ainda não tem serviços cadastrados.`;
  }
  const byName = new Map(
    services.map((service) => [key(service.name), service]),
  );
  const namedKeys = new Set(named.map(key));
  // A name the model matched that is not an active service of this barbershop
  // is treated as not offered (RN-26, AC 5).
  const unknown = [
    ...named.filter((name) => !byName.has(key(name))),
    ...unknownServices,
  ];
  const matched = services.filter((service) =>
    namedKeys.has(key(service.name)),
  );
  const listed =
    matched.length === 0 && unknown.length === 0 ? services : matched;

  const lines: string[] = [];
  if (listed.length > 0) {
    lines.push(`Na ${barbershopName}:`);
    for (const service of listed) {
      lines.push(
        `- ${service.name}: ${formatPrice(service.priceCents)}, ${formatDuration(service.durationMinutes)}`,
      );
    }
  }
  for (const name of unknown) {
    lines.push(`A ${barbershopName} não oferece ${name}.`);
  }
  return lines.join('\n');
}

function addressBlock(barbershop: Barbershop): string {
  if (!barbershop.address) {
    return `A ${barbershop.name} ainda não informou o endereço.`;
  }
  return `Endereço da ${barbershop.name}: ${barbershop.address}`;
}

function openingHoursBlock(barbershop: Barbershop): string {
  const lines = WEEKDAYS.map((weekday) => {
    const label = WEEKDAY_LABELS[weekday];
    const day = barbershop.openingHours.forDay(weekday);
    if (!day) return `${label}: fechado`;
    const hours = `${label}: ${day.opensAt.toString()} às ${day.closesAt.toString()}`;
    if (!day.break) return hours;
    return `${hours} (intervalo ${day.break.startsAt.toString()} às ${day.break.endsAt.toString()})`;
  });
  return ['Horário de funcionamento:', ...lines].join('\n');
}

function key(name: string): string {
  return name.trim().toLocaleLowerCase('pt-BR');
}
