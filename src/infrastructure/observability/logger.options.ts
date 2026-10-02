import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Env } from '../config/env.schema';

export const REQUEST_ID_HEADER = 'x-request-id';

const silentPaths = ['/health', '/metrics'];

function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incoming === 'string' && incoming.length > 0
      ? incoming
      : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}

export function buildLoggerOptions(
  env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>,
): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: resolveRequestId,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
      autoLogging: {
        ignore: (req) =>
          silentPaths.some((path) => req.url?.startsWith(path) ?? false),
      },
      // LGPD: telefone, senha, e-mail, tokens e conteúdo de mensagens são dados pessoais.
      redact: {
        paths: [
          'req.headers.authorization',
          // US-20: the Asaas webhook token.
          'req.headers["asaas-access-token"]',
          'req.headers.cookie',
          '*.password',
          '*.newPassword',
          '*.phone',
          '*.message',
          '*.email',
          '*.token',
          '*.accessToken',
          // US-20: the payer's CPF or CNPJ.
          '*.cpfCnpj',
        ],
        censor: '[REDACTED]',
      },
    },
  };
}
