import type { HandoffReason } from '../../domain/value-objects/handoff-reason';
import {
  BotResumeTrigger,
  ClientReplyKind,
  PrivacyNoticeOutcome,
  WhatsAppMetrics,
} from '../ports/whatsapp-metrics.port';

export class CountingWhatsAppMetrics implements WhatsAppMetrics {
  disconnections = 0;
  clientsCreated = 0;
  readonly privacyNotices: PrivacyNoticeOutcome[] = [];
  readonly replies: ClientReplyKind[] = [];
  readonly handoffs: HandoffReason[] = [];
  readonly resumes: BotResumeTrigger[] = [];

  disconnected(): void {
    this.disconnections += 1;
  }

  clientCreated(): void {
    this.clientsCreated += 1;
  }

  privacyNotice(outcome: PrivacyNoticeOutcome): void {
    this.privacyNotices.push(outcome);
  }

  reply(kind: ClientReplyKind): void {
    this.replies.push(kind);
  }

  handoff(reason: HandoffReason): void {
    this.handoffs.push(reason);
  }

  botResumed(trigger: BotResumeTrigger): void {
    this.resumes.push(trigger);
  }
}
