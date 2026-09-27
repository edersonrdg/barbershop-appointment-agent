import { UserInvitation } from '../../domain/entities/user-invitation';
import { EmailAlreadyRegisteredError } from '../../domain/errors/email-already-registered.error';
import { InvitationDeliveryFailedError } from '../../domain/errors/invitation-delivery-failed.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { Email } from '../../domain/value-objects/email';
import { BarbershopRepository } from '../ports/barbershop.repository.port';
import { Clock } from '../ports/clock.port';
import { EmailSender } from '../ports/email-sender.port';
import { IdGenerator } from '../ports/id-generator.port';
import { ResetTokenGenerator } from '../ports/reset-token-generator.port';
import { UserInvitationRepository } from '../ports/user-invitation.repository.port';
import { UserRepository } from '../ports/user.repository.port';

export interface InviteBarberInput {
  barbershopId: string;
  email: string;
  name: string;
}

export const INVITATION_EMAIL_SUBJECT = 'Convite para o painel da barbearia';

export class InviteBarberUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly barbershops: BarbershopRepository,
    private readonly invitations: UserInvitationRepository,
    private readonly tokenGenerator: ResetTokenGenerator,
    private readonly emailSender: EmailSender,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly appWebUrl: string,
  ) {}

  async execute(input: InviteBarberInput): Promise<UserInvitation> {
    const email = Email.create(input.email).value;
    // E-mails are unique across the whole platform, so an e-mail that already
    // belongs to any barbershop can never accept an invitation.
    if (await this.users.findByEmail(email)) {
      throw new EmailAlreadyRegisteredError();
    }

    const barbershop = await this.barbershops.findById(input.barbershopId);
    if (!barbershop) {
      throw new UserNotFoundError();
    }

    const { token, tokenHash } = this.tokenGenerator.generate();
    const invitation = UserInvitation.issue({
      id: this.idGenerator.next(),
      barbershopId: barbershop.id,
      email,
      name: input.name,
      tokenHash,
      now: this.clock.now(),
    });
    await this.invitations.replacePending(invitation);

    const link = `${this.appWebUrl}/aceitar-convite?token=${token}`;
    try {
      await this.emailSender.send({
        to: email,
        subject: INVITATION_EMAIL_SUBJECT,
        text: buildMessage(input.name, barbershop.name, link),
      });
    } catch {
      throw new InvitationDeliveryFailedError();
    }

    return invitation;
  }
}

function buildMessage(
  name: string,
  barbershopName: string,
  link: string,
): string {
  return [
    `Olá, ${name}.`,
    '',
    `Você foi convidado para acessar o painel da ${barbershopName} com o perfil Barbeiro.`,
    'Para criar sua senha e entrar, acesse o link abaixo. Ele vale por 7 dias e só pode ser usado uma vez.',
    '',
    link,
    '',
    'Se você não esperava este convite, ignore este e-mail.',
  ].join('\n');
}
