import { validateEnv } from './env.schema';

const validEnv = {
  DB_HOST: 'localhost',
  DB_USER: 'barbershop',
  DB_PASSWORD: 'secret',
  DB_NAME: 'barbershop',
};

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = validateEnv(validEnv);

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DB_PORT: 5432,
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
});
