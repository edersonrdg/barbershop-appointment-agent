import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { FakeEmailSender } from '../../src/usecases/testing/fake-email-sender';

export const PASSWORD = 'senha-secreta-123';

export interface SignedUpOwner {
  accessToken: string;
}

export async function signupOwner(
  app: INestApplication<App>,
  email: string,
  barbershopName = 'Barbearia do Zé',
): Promise<SignedUpOwner> {
  const response = await request(app.getHttpServer())
    .post('/auth/signup')
    .send({
      barbershopName,
      ownerName: 'José da Silva',
      email,
      phone: '11912345678',
      password: PASSWORD,
    })
    .expect(201);
  return {
    accessToken: (response.body as { accessToken: string }).accessToken,
  };
}

export function inviteBarber(
  app: INestApplication<App>,
  ownerToken: string,
  body: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .post('/users/invitations')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send(body);
}

export function acceptInvitation(
  app: INestApplication<App>,
  body: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .post('/auth/invitations/accept')
    .send(body);
}

export function invitationTokenFromLastEmail(
  emailSender: FakeEmailSender,
  appWebUrl: string,
): string {
  const text = emailSender.sent[emailSender.sent.length - 1].text;
  const escapedUrl = appWebUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `${escapedUrl}/aceitar-convite\\?token=([A-Za-z0-9_-]+)`,
  ).exec(text);
  if (!match) throw new Error('invitation link not found in the e-mail');
  return match[1];
}

// Invites and accepts, returning the barber's session token.
export async function createBarber(
  app: INestApplication<App>,
  emailSender: FakeEmailSender,
  appWebUrl: string,
  ownerToken: string,
  email: string,
  name = 'João Pereira',
): Promise<string> {
  await inviteBarber(app, ownerToken, { email, name }).expect(201);
  const response = await acceptInvitation(app, {
    token: invitationTokenFromLastEmail(emailSender, appWebUrl),
    password: PASSWORD,
  }).expect(201);
  return (response.body as { accessToken: string }).accessToken;
}
