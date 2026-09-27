import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { EMAIL_SENDER } from '../../src/usecases/ports/email-sender.port';
import { FakeEmailSender } from '../../src/usecases/testing/fake-email-sender';

export interface AccountTestApp {
  app: INestApplication<App>;
  dataSource: DataSource;
  emailSender: FakeEmailSender;
}

// The SMTP adapter is swapped for a capturing fake so no e2e suite talks to a
// real mail server.
export async function createAccountTestApp(
  extraControllers: Type[] = [],
): Promise<AccountTestApp> {
  const emailSender = new FakeEmailSender();
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  })
    .overrideProvider(EMAIL_SENDER)
    .useValue(emailSender)
    .compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  await app.init();

  return { app, dataSource: app.get(DataSource), emailSender };
}
