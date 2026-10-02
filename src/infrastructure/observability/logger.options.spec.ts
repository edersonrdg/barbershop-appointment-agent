import pino, { type DestinationStream } from 'pino';
import type { Options } from 'pino-http';
import { buildLoggerOptions } from './logger.options';

function logWithRedact(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const chunks: string[] = [];
  const stream: DestinationStream = {
    write: (msg: string) => {
      chunks.push(msg);
    },
  };
  // buildLoggerOptions sempre devolve o objeto de Options do pino-http aqui,
  // nunca a stream nem a tupla que o tipo de nestjs-pino também permite.
  const { pinoHttp } = buildLoggerOptions({
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
  });
  const { redact } = pinoHttp as Options;

  const logger = pino({ redact }, stream);
  // *.<campo> só casa um nível de aninhamento (ex.: req.body seria req.body.password
  // via string literal); aqui simulamos o objeto de negócio logado sob uma chave.
  logger.info({ payload: fields }, 'evento de teste');

  return JSON.parse(chunks[0]) as Record<string, unknown>;
}

describe('buildLoggerOptions redact', () => {
  it('CA: redacts password, newPassword, email, phone, token and accessToken', () => {
    const log = logWithRedact({
      password: 'senha-secreta',
      newPassword: 'senha-nova',
      email: 'dono@barbearia.com',
      phone: '+5511912345678',
      token: 'reset-token-abc',
      accessToken: 'jwt-abc',
    });
    const payload = log.payload as Record<string, unknown>;

    expect(payload.password).toBe('[REDACTED]');
    expect(payload.newPassword).toBe('[REDACTED]');
    expect(payload.email).toBe('[REDACTED]');
    expect(payload.phone).toBe('[REDACTED]');
    expect(payload.token).toBe('[REDACTED]');
    expect(payload.accessToken).toBe('[REDACTED]');
  });

  it('US-20 AC 33: redacts the payer document and the Asaas webhook token (C41)', () => {
    const log = logWithRedact({ cpfCnpj: '52998224725' });
    expect((log.payload as Record<string, unknown>).cpfCnpj).toBe('[REDACTED]');

    const chunks: string[] = [];
    const { pinoHttp } = buildLoggerOptions({
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
    });
    const logger = pino(
      { redact: (pinoHttp as Options).redact },
      {
        write: (msg: string) => {
          chunks.push(msg);
        },
      },
    );
    logger.info(
      { req: { headers: { 'asaas-access-token': 'webhook-token' } } },
      'webhook',
    );
    const req = (
      JSON.parse(chunks[0]) as { req: { headers: Record<string, string> } }
    ).req;
    expect(req.headers['asaas-access-token']).toBe('[REDACTED]');
  });
});
