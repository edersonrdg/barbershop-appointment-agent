import { PasswordResetToken } from '../../domain/entities/password-reset-token';
import { Email } from '../../domain/value-objects/email';
import { Clock } from '../ports/clock.port';
import { EmailSender } from '../ports/email-sender.port';
import { IdGenerator } from '../ports/id-generator.port';
import { PasswordResetRepository } from '../ports/password-reset.repository.port';
import { ResetTokenGenerator } from '../ports/reset-token-generator.port';
import { UserRepository } from '../ports/user.repository.port';

export interface RequestPasswordResetInput {
  email: string;
}

export const PASSWORD_RESET_EMAIL_SUBJECT = 'Redefinição de senha';

export class RequestPasswordResetUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordResets: PasswordResetRepository,
    private readonly resetTokenGenerator: ResetTokenGenerator,
    private readonly emailSender: EmailSender,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly appWebUrl: string,
  ) {}

  // Resolves the same way whether or not the e-mail exists, so the response
  // never reveals which e-mails are registered.
  async execute(input: RequestPasswordResetInput): Promise<void> {
    if (!Email.isValid(input.email)) {
      return;
    }

    const user = await this.users.findByEmail(Email.create(input.email).value);
    if (!user) {
      return;
    }

    const { token, tokenHash } = this.resetTokenGenerator.generate();
    await this.passwordResets.replaceForUser(
      PasswordResetToken.issue({
        id: this.idGenerator.next(),
        userId: user.id,
        barbershopId: user.barbershopId,
        tokenHash,
        now: this.clock.now(),
      }),
    );

    const link = `${this.appWebUrl}/redefinir-senha?token=${token}`;
    try {
      await this.emailSender.send({
        to: user.email,
        subject: PASSWORD_RESET_EMAIL_SUBJECT,
        text: buildMessage(user.name, link),
      });
    } catch {
      // A send failure must look like success to the caller; the e-mail
      // adapter already logs it without PII.
    }
  }
}

function buildMessage(name: string, link: string): string {
  return [
    `Olá, ${name}.`,
    '',
    'Recebemos um pedido para redefinir a senha da sua conta.',
    'Para criar uma nova senha, acesse o link abaixo. Ele vale por 1 hora e só pode ser usado uma vez.',
    '',
    link,
    '',
    'Se você não pediu a redefinição, ignore este e-mail. Sua senha continua a mesma.',
  ].join('\n');
}
