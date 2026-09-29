import { validateEnv } from './env.schema';

const validEnv = {
  DB_HOST: 'localhost',
  DB_USER: 'barbershop',
  DB_PASSWORD: 'secret',
  DB_NAME: 'barbershop',
  JWT_SECRET: 'a'.repeat(32),
  APP_WEB_URL: 'https://painel.exemplo.com.br',
  SMTP_HOST: 'localhost',
  MAIL_FROM: 'BarberBot <nao-responda@barberbot.local>',
  EVOLUTION_API_URL: 'http://localhost:8080',
  EVOLUTION_API_KEY: 'evolution-key',
  WHATSAPP_WEBHOOK_URL: 'http://localhost:3000/webhooks/whatsapp/evolution',
  WHATSAPP_WEBHOOK_SECRET: 'w'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = validateEnv(validEnv);

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DB_PORT: 5432,
      AUTH_SESSION_TTL_SECONDS: 604800,
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
      API_DOCS_ENABLED: false,
    });
  });

  it('turns the API docs on only for the literal "true"', () => {
    expect(
      validateEnv({ ...validEnv, API_DOCS_ENABLED: 'true' }),
    ).toMatchObject({ API_DOCS_ENABLED: true });
    expect(() => validateEnv({ ...validEnv, API_DOCS_ENABLED: 'yes' })).toThrow(
      /API_DOCS_ENABLED/,
    );
  });

  it('coerces numeric variables from strings', () => {
    const env = validateEnv({ ...validEnv, PORT: '8080', DB_PORT: '6543' });

    expect(env.PORT).toBe(8080);
    expect(env.DB_PORT).toBe(6543);
  });

  it('fails fast when a required variable is missing', () => {
    expect(() => validateEnv({ ...validEnv, DB_PASSWORD: undefined })).toThrow(
      /DB_PASSWORD/,
    );
  });

  it('fails when JWT_SECRET is missing', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: undefined })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('fails when JWT_SECRET is shorter than 32 characters', () => {
    expect(() =>
      validateEnv({ ...validEnv, JWT_SECRET: 'a'.repeat(31) }),
    ).toThrow(/JWT_SECRET/);
  });

  it('fails when APP_WEB_URL is not a valid url', () => {
    expect(() =>
      validateEnv({ ...validEnv, APP_WEB_URL: 'not-a-url' }),
    ).toThrow(/APP_WEB_URL/);
  });

  it('parses SMTP_SECURE "true" as the boolean true', () => {
    const env = validateEnv({ ...validEnv, SMTP_SECURE: 'true' });

    expect(env.SMTP_SECURE).toBe(true);
  });

  it('parses SMTP_SECURE "false" as the boolean false', () => {
    const env = validateEnv({ ...validEnv, SMTP_SECURE: 'false' });

    expect(env.SMTP_SECURE).toBe(false);
  });

  it('leaves SMTP_USER and SMTP_PASSWORD undefined when not provided', () => {
    const env = validateEnv(validEnv);

    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASSWORD).toBeUndefined();
  });

  it('treats an empty SMTP_USER/SMTP_PASSWORD (as shipped in .env.example) as not provided', () => {
    const env = validateEnv({
      ...validEnv,
      SMTP_USER: '',
      SMTP_PASSWORD: '',
    });

    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASSWORD).toBeUndefined();
  });

  describe('CA-13.1 (C36): WhatsApp connector variables', () => {
    it.each([
      'EVOLUTION_API_URL',
      'EVOLUTION_API_KEY',
      'WHATSAPP_WEBHOOK_URL',
      'WHATSAPP_WEBHOOK_SECRET',
    ])('fails without %s', (name) => {
      expect(() => validateEnv({ ...validEnv, [name]: undefined })).toThrow(
        new RegExp(name),
      );
    });

    it('requires a webhook secret of at least 32 characters', () => {
      expect(() =>
        validateEnv({ ...validEnv, WHATSAPP_WEBHOOK_SECRET: 'w'.repeat(31) }),
      ).toThrow(/WHATSAPP_WEBHOOK_SECRET/);
      expect(
        validateEnv({ ...validEnv, WHATSAPP_WEBHOOK_SECRET: 'w'.repeat(32) })
          .WHATSAPP_WEBHOOK_SECRET,
      ).toBe('w'.repeat(32));
    });

    it('defaults the connector timeout to 10000 ms', () => {
      expect(validateEnv(validEnv).EVOLUTION_TIMEOUT_MS).toBe(10000);
    });
  });
});
