import { Client } from '../../domain/entities/client';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { ClientRepository } from '../ports/client.repository.port';
import { Clock } from '../ports/clock.port';
import { IdGenerator } from '../ports/id-generator.port';
import { WhatsAppConnectionRepository } from '../ports/whatsapp-connection.repository.port';
import { WhatsAppConnector } from '../ports/whatsapp-connector.port';
import { WhatsAppMetrics } from '../ports/whatsapp-metrics.port';

export interface ReceiveWhatsAppMessageInput {
  barbershopId: string;
  /** E.164 phone of the client who wrote (RN-08). */
  phone: string;
  /** WhatsApp profile name, when the connector gives one. */
  profileName: string | null;
}

export type PrivacyNoticeResult =
  | { outcome: 'none' }
  | { outcome: 'sent' }
  | { outcome: 'failed'; error: unknown };

export const FALLBACK_CLIENT_NAME = 'Cliente do WhatsApp';

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 80;
const DIGITS_ONLY_PATTERN = /^\d+$/;
const TRAILING_HIGH_SURROGATE_PATTERN = /[\uD800-\uDBFF]$/;
const NO_NOTICE: PrivacyNoticeResult = { outcome: 'none' };

export function privacyNoticeText(
  barbershopName: string,
  privacyPolicyUrl: string,
): string {
  return `Olá! Aqui é o assistente virtual da ${barbershopName}. O atendimento é feito por inteligência artificial, e usamos seu nome e telefone para agendar seus horários. Política de privacidade: ${privacyPolicyUrl}`;
}

// US-14: the first message of a phone creates the client (RF-29) and every
// client gets the privacy notice once, on the first message it sends (RN-20).
export class ReceiveWhatsAppMessageUseCase {
  constructor(
    private readonly connections: WhatsAppConnectionRepository,
    private readonly barbershops: BarbershopRepository,
    private readonly clients: ClientRepository,
    private readonly connector: WhatsAppConnector,
    private readonly metrics: WhatsAppMetrics,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly privacyPolicyUrl: string,
  ) {}

  async execute(
    input: ReceiveWhatsAppMessageInput,
  ): Promise<PrivacyNoticeResult> {
    const connection = await this.connections.findByBarbershopId(
      input.barbershopId,
    );
    if (!connection) return NO_NOTICE;
    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) return NO_NOTICE;

    const client = await this.findOrCreateClient(input);
    return this.sendPrivacyNotice(client, barbershop.name);
  }

  private async findOrCreateClient(
    input: ReceiveWhatsAppMessageInput,
  ): Promise<Client> {
    const existing = await this.clients.findByPhone(
      input.barbershopId,
      input.phone,
    );
    if (existing) return existing;

    const candidate = Client.create({
      id: this.ids.next(),
      barbershopId: input.barbershopId,
      name: clientName(input.profileName),
      phone: PhoneNumber.create(input.phone),
      now: this.clock.now(),
    });
    if (await this.clients.createIfAbsent(candidate)) {
      this.metrics.clientCreated();
      return candidate;
    }
    // Another message of the same phone created the client first (door 2).
    const winner = await this.clients.findByPhone(
      input.barbershopId,
      input.phone,
    );
    return winner ?? candidate;
  }

  // The notice is claimed before it is sent, so concurrent or redelivered
  // messages send it once; a failed send releases the claim for the next one.
  private async sendPrivacyNotice(
    client: Client,
    barbershopName: string,
  ): Promise<PrivacyNoticeResult> {
    const sentAt = this.clock.now();
    if (!(await this.clients.claimPrivacyNotice(client, sentAt))) {
      return NO_NOTICE;
    }
    try {
      await this.connector.sendText(
        client.barbershopId,
        client.phone,
        privacyNoticeText(barbershopName, this.privacyPolicyUrl),
      );
    } catch (error) {
      await this.clients.releasePrivacyNotice(client, sentAt);
      this.metrics.privacyNotice('failed');
      return { outcome: 'failed', error };
    }
    this.metrics.privacyNotice('sent');
    return { outcome: 'sent' };
  }
}

// The Evolution API fills a missing profile name with the phone digits, and
// the client name must have 2 to 80 characters.
function clientName(profileName: string | null): string {
  const name = profileName?.trim() ?? '';
  if (name.length < NAME_MIN_LENGTH || DIGITS_ONLY_PATTERN.test(name)) {
    return FALLBACK_CLIENT_NAME;
  }
  return name
    .slice(0, NAME_MAX_LENGTH)
    .replace(TRAILING_HIGH_SURROGATE_PATTERN, '');
}
