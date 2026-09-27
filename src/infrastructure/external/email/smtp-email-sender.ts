import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';
import {
  EmailMessage,
  EmailSender,
} from '../../../usecases/ports/email-sender.port';

export interface MailTransport {
  sendMail(options: SendMailOptions): Promise<unknown>;
}

export interface SmtpTransportEnv {
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
}

export function createSmtpTransport(env: SmtpTransportEnv): MailTransport {
  return createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    // SMTP_USER opcional (ex.: Mailpit em dev não exige autenticação).
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
  });
}

export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly transport: MailTransport,
    private readonly mailFrom: string,
    private readonly logger: Logger = new Logger(SmtpEmailSender.name),
  ) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.mailFrom,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    } catch (error) {
      // LGPD: nunca logar destinatário nem corpo do e-mail (RN de observabilidade).
      const err = error as { name?: string; code?: string };
      this.logger.error(
        { err: { name: err.name, code: err.code } },
        'Falha ao enviar e-mail via SMTP.',
      );
      throw error;
    }
  }
}
