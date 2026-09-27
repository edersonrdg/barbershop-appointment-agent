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
    });
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
});
