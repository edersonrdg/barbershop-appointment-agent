import { PasswordHasher } from '../ports/password-hasher.port';

export class FakePasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`hashed(${plain})`);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed(${plain})`);
  }
}
