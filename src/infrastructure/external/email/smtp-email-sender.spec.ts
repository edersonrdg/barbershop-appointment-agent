import { Logger } from '@nestjs/common';
import type { SendMailOptions } from 'nodemailer';
import { MailTransport, SmtpEmailSender } from './smtp-email-sender';

describe('SmtpEmailSender', () => {
  const mailFrom = 'no-reply@barbearia.com';

  it('sends from = MAIL_FROM, to, subject and text to the transport', async () => {
    const sentMessages: SendMailOptions[] = [];
    const transport: MailTransport = {
      sendMail: (options) => {
        sentMessages.push(options);
        return Promise.resolve(undefined);
      },
    };
    const sender = new SmtpEmailSender(transport, mailFrom);

    await sender.send({
      to: 'dono@barbearia.com',
      subject: 'Redefinição de senha',
      text: 'Link: https://app.exemplo.com/redefinir-senha?token=abc',
    });

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toEqual({
      from: mailFrom,
      to: 'dono@barbearia.com',
      subject: 'Redefinição de senha',
      text: 'Link: https://app.exemplo.com/redefinir-senha?token=abc',
    });
  });

  it('CA-01.5: when the transport fails, it rethrows and the log contains neither the recipient nor the body', async () => {
    const recipient = 'dono@barbearia.com';
    const bodyText = 'Link: https://app.exemplo.com/redefinir-senha?token=abc';
    const transportError = Object.assign(new Error('connection refused'), {
      name: 'SMTPConnectionError',
      code: 'ECONNREFUSED',
    });
    const transport: MailTransport = {
      sendMail: () => Promise.reject(transportError),
    };
    const logger = new Logger('test');
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation();
    const sender = new SmtpEmailSender(transport, mailFrom, logger);

    await expect(
      sender.send({
        to: recipient,
        subject: 'Redefinição de senha',
        text: bodyText,
      }),
    ).rejects.toBe(transportError);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = JSON.stringify(errorSpy.mock.calls[0]);
    expect(loggedArgs).not.toContain(recipient);
    expect(loggedArgs).not.toContain(bodyText);
  });
});
