import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Registry } from 'prom-client';
import { MESSAGE_INTERPRETER } from '../../usecases/ports/message-interpreter.port';
import type { Env } from '../config/env.schema';
import { createGeminiMessageInterpreter } from '../external/gemini/create-gemini-message-interpreter';
import { METRICS_REGISTRY } from '../observability/metrics.registry';
import { ObservabilityModule } from '../observability/observability.module';

// US-15: the Gemini message interpreter. Global so the readiness
// check can ping it through the port, like the WhatsApp connector.
@Global()
@Module({
  imports: [ObservabilityModule],
  providers: [
    {
      provide: MESSAGE_INTERPRETER,
      inject: [ConfigService, METRICS_REGISTRY],
      useFactory: (config: ConfigService<Env, true>, registry: Registry) =>
        createGeminiMessageInterpreter(
          {
            apiKey: config.get('GEMINI_API_KEY', { infer: true }),
            model: config.get('GEMINI_MODEL', { infer: true }),
            timeoutMs: config.get('GEMINI_TIMEOUT_MS', { infer: true }),
          },
          registry,
        ),
    },
  ],
  exports: [MESSAGE_INTERPRETER],
})
export class GeminiModule {}
