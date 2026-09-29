import {
  WhatsAppConnection,
  WhatsAppConnectorState,
} from '../../domain/entities/whatsapp-connection';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { Clock } from '../ports/clock.port';
import { EmailSender } from '../ports/email-sender.port';
import { UserRepository } from '../ports/user.repository.port';
import { WhatsAppConnectionRepository } from '../ports/whatsapp-connection.repository.port';
import { WhatsAppMetrics } from '../ports/whatsapp-metrics.port';

export interface ApplyWhatsAppConnectionStateInput {
  barbershopId: string;
  state: WhatsAppConnectorState;
}

export type DropAlert =
  | { outcome: 'none' }
  | { outcome: 'sent' }
  | { outcome: 'failed'; error: unknown };

export interface ApplyWhatsAppConnectionStateResult {
  // Null when the barbershop never asked to connect: there is nothing to update.
  connection: WhatsAppConnection | null;
  alert: DropAlert;
}

export const DROP_EMAIL_SUBJECT = 'O WhatsApp da barbearia desconectou';
export const RECONNECT_PATH = '/configuracoes/whatsapp';

const NO_ALERT: DropAlert = { outcome: 'none' };

export class ApplyWhatsAppConnectionStateUseCase {
  constructor(
    private readonly connections: WhatsAppConnectionRepository,
    private readonly barbershops: BarbershopRepository,
    private readonly users: UserRepository,
    private readonly emailSender: EmailSender,
    private readonly metrics: WhatsAppMetrics,
    private readonly clock: Clock,
    private readonly appWebUrl: string,
  ) {}

  async execute(
    input: ApplyWhatsAppConnectionStateInput,
  ): Promise<ApplyWhatsAppConnectionStateResult> {
    const stored = await this.connections.findByBarbershopId(
      input.barbershopId,
    );
    if (!stored) {
      return { connection: null, alert: NO_ALERT };
    }

    const { connection, changed, dropped } = stored.apply(
      input.state,
      this.clock.now(),
    );
    if (!changed) {
      return { connection, alert: NO_ALERT };
    }
    if (!dropped) {
      await this.connections.save(connection);
      return { connection, alert: NO_ALERT };
    }

    // CA-13.3: a webhook and a panel read can see the same drop at once; only
    // the writer that flips the stored row alerts the Owner.
    if (!(await this.connections.recordDrop(connection))) {
      return {
        connection:
          (await this.connections.findByBarbershopId(input.barbershopId)) ??
          connection,
        alert: NO_ALERT,
      };
    }
    this.metrics.disconnected();
    return { connection, alert: await this.alertOwners(connection) };
  }

  // RNF-07: the drop stays recorded even when the e-mail cannot be sent.
  private async alertOwners(
    connection: WhatsAppConnection,
  ): Promise<DropAlert> {
    try {
      const barbershop = await this.barbershops.findById(
        connection.barbershopId,
      );
      if (!barbershop) {
        return NO_ALERT;
      }
      const owners = (
        await this.users.listByBarbershop(connection.barbershopId)
      ).filter((user) => user.role === 'owner');
      const droppedAt = formatLocal(
        connection.disconnectedAt ?? this.clock.now(),
        barbershop.timezone,
      );
      const results = await Promise.allSettled(
        owners.map((owner) =>
          this.emailSender.send({
            to: owner.email,
            subject: DROP_EMAIL_SUBJECT,
            text: buildMessage(owner.name, barbershop.name, droppedAt, [
              this.appWebUrl,
              RECONNECT_PATH,
            ]),
          }),
        ),
      );
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      return failure
        ? { outcome: 'failed', error: failure.reason }
        : { outcome: 'sent' };
    } catch (error) {
      return { outcome: 'failed', error };
    }
  }
}

function buildMessage(
  ownerName: string,
  barbershopName: string,
  droppedAt: string,
  [appWebUrl, path]: [string, string],
): string {
  return [
    `Olá, ${ownerName}.`,
    '',
    `O WhatsApp da barbearia ${barbershopName} desconectou em ${droppedAt}. Enquanto ele estiver desconectado, o assistente não responde aos clientes.`,
    '',
    `Para conectar de novo, acesse ${appWebUrl}${path} e leia o QR code no WhatsApp Business.`,
  ].join('\n');
}

// dd/MM/yyyy HH:mm in the barbershop's timezone (RNF-04).
function formatLocal(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}
