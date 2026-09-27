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
      // LGPD: telefone, senha e conteúdo de mensagens são dados pessoais dos clientes finais.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.password',
          '*.phone',
          '*.message',
        ],
        censor: '[REDACTED]',
      },
    },
  };
}
