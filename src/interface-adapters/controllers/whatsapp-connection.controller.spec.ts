import { Logger } from '@nestjs/common';
import { WhatsAppConnection } from '../../domain/entities/whatsapp-connection';
import { ConnectWhatsAppUseCase } from '../../usecases/connect-whatsapp/connect-whatsapp.use-case';
import {
  GetWhatsAppConnectionResult,
  GetWhatsAppConnectionUseCase,
} from '../../usecases/get-whatsapp-connection/get-whatsapp-connection.use-case';
import type { AuthenticatedSession } from './authenticated-session';
import { WhatsAppConnectionController } from './whatsapp-connection.controller';

const SHOP = '0b9f7d8e-8a55-4c1c-9d51-6f2f3d1f0a11';
const OWNER_EMAIL = 'dono@barbearia.com';
const DROPPED_AT = new Date('2026-09-29T15:00:00.000Z');

class SmtpError extends Error {
  override readonly name = 'SmtpError';
  readonly code = 'EENVELOPE';
}

function controllerReturning(result: GetWhatsAppConnectionResult) {
  const getConnection = {
    execute: () => Promise.resolve(result),
  } as unknown as GetWhatsAppConnectionUseCase;
  return new WhatsAppConnectionController(
    {} as ConnectWhatsAppUseCase,
    getConnection,
  );
}

const session = {
  userId: 'owner-1',
  barbershopId: SHOP,
  role: 'owner',
} as AuthenticatedSession;

describe('WhatsAppConnectionController', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('CA-13.3 (C21): logs a failed drop alert with only the barbershop id and the error identity', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const controller = controllerReturning({
      connection: WhatsAppConnection.restore({
        barbershopId: SHOP,
        status: 'disconnected',
        disconnectedAt: DROPPED_AT,
        updatedAt: DROPPED_AT,
      }),
      alert: {
        outcome: 'failed',
        error: new SmtpError(`Recipient ${OWNER_EMAIL} rejected`),
      },
    });

    const response = await controller.show(session);

    expect(response).toEqual({
      status: 'disconnected',
      disconnectedAt: '2026-09-29T15:00:00.000Z',
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toEqual({
      barbershopId: SHOP,
      err: { name: 'SmtpError', code: 'EENVELOPE' },
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain(OWNER_EMAIL);
  });
});
