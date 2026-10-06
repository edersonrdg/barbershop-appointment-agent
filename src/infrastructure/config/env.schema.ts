import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    AUTH_SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(604800),
    APP_WEB_URL: z.string().url(),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    // "true"/"false" chegam como string do process.env; z.coerce.boolean()
    // trataria qualquer string não vazia (inclusive "false") como true.
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    // O .env.example deixa essas chaves em branco quando não usadas; uma
    // string vazia deve contar como "não informado", não como valor inválido.
    SMTP_USER: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    SMTP_PASSWORD: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    MAIL_FROM: z.string().min(1),
    // WhatsApp (US-13): Evolution API self-hosted, reached by the adapter only.
    EVOLUTION_API_URL: z.string().url(),
    EVOLUTION_API_KEY: z.string().min(1),
    EVOLUTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    // Where the Evolution API posts the webhooks; it must reach this API.
    WHATSAPP_WEBHOOK_URL: z.string().url(),
    WHATSAPP_WEBHOOK_SECRET: z.string().min(32),
    // US-14 (RN-20): the platform's privacy policy, linked in the first reply.
    PRIVACY_POLICY_URL: z.string().url(),
    // US-16 (RN-23): hours without messages before a paused conversation goes
    // back to the bot; 12 is a suggestion still to be validated.
    WHATSAPP_HANDOFF_RESUME_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .default(12),
    // Gemini (US-15): reached only by the adapter in infrastructure/external/gemini.
    GEMINI_API_KEY: z.string().min(1),
    GEMINI_MODEL: z.string().min(1),
    // Keeps the bot's reply within RNF-01 (10 s), with room for the WhatsApp send.
    GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
    // Assinatura (US-20): Asaas, reached only by the adapter in
    // infrastructure/external/payments/asaas. The base includes `/v3`.
    ASAAS_API_URL: z.string().url(),
    ASAAS_API_KEY: z.string().min(1),
    ASAAS_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    // Sent by the Asaas in the `asaas-access-token` header of every webhook.
    ASAAS_WEBHOOK_TOKEN: z.string().min(32),
    // The price is still open (PRD section 19), so it has no default.
    SUBSCRIPTION_PRICE_CENTS: z.coerce.number().int().positive(),
    // CA-20.2: days before the trial ends to warn the Owner; 3 is a suggestion
    // still to be validated.
    SUBSCRIPTION_TRIAL_WARNING_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(3),
    // RN-25 and CA-21.3: days a failed payment is tolerated before the
    // barbershop is suspended; 5 is a suggestion still to be validated.
    SUBSCRIPTION_GRACE_DAYS: z.coerce.number().int().min(0).default(5),
    // A documentação expõe o mapa da API; fica desligada salvo opt-in explícito.
    API_DOCS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  // An alias like `gemini-flash-latest` changes model without a deploy.
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' || !env.GEMINI_MODEL.endsWith('-latest'),
    {
      path: ['GEMINI_MODEL'],
      message:
        'Use uma versão fixa do modelo em produção, não um alias -latest.',
    },
  );

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (result.success) {
    return result.data;
  }

  throw new Error(
    `Invalid environment variables:\n${z.prettifyError(result.error)}`,
  );
}
