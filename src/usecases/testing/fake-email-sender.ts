import { EmailMessage, EmailSender } from '../ports/email-sender.port';

export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failure: Error | null = null;

  send(message: EmailMessage): Promise<void> {
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}
