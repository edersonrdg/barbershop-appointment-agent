import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';
import { PasswordHasher } from '../../usecases/ports/password-hasher.port';

// @types/node não expõe uma sobrecarga __promisify__ para scrypt com
// options; promisify(scrypt) por si só resolveria para a assinatura de 3
// argumentos e perderia N/r/p.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

// RNF-06: parâmetros do scrypt embutidos no próprio hash (AD-005), o que
// permite endurecê-los depois sem migração de dados.
const SALT_LENGTH_BYTES = 16;
const COST_FACTOR_N = 16384;
const BLOCK_SIZE_R = 8;
const PARALLELIZATION_P = 1;
const KEY_LENGTH_BYTES = 64;

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH_BYTES);
    const derivedKey = await this.derive(plain, salt);
    return [
      'scrypt',
      COST_FACTOR_N,
      BLOCK_SIZE_R,
      PARALLELIZATION_P,
      salt.toString('base64'),
      derivedKey.toString('base64'),
    ].join('$');
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    const parsed = this.parse(hash);
    if (!parsed) {
      return false;
    }

    const derivedKey = await this.derive(
      plain,
      parsed.salt,
      parsed.n,
      parsed.r,
      parsed.p,
    );

    if (derivedKey.length !== parsed.hash.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, parsed.hash);
  }

  private parse(hash: string): {
    n: number;
    r: number;
    p: number;
    salt: Buffer;
    hash: Buffer;
  } | null {
    const parts = hash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      return null;
    }

    const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
    const n = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (
      !Number.isInteger(n) ||
      !Number.isInteger(r) ||
      !Number.isInteger(p) ||
      n <= 0 ||
      r <= 0 ||
      p <= 0
    ) {
      return null;
    }

    try {
      const salt = Buffer.from(saltRaw, 'base64');
      const hashBuffer = Buffer.from(hashRaw, 'base64');
      if (salt.length === 0 || hashBuffer.length === 0) {
        return null;
      }
      return { n, r, p, salt, hash: hashBuffer };
    } catch {
      return null;
    }
  }

  private async derive(
    plain: string,
    salt: Buffer,
    n: number = COST_FACTOR_N,
    r: number = BLOCK_SIZE_R,
    p: number = PARALLELIZATION_P,
  ): Promise<Buffer> {
    return scryptAsync(plain, salt, KEY_LENGTH_BYTES, { N: n, r, p });
  }
}
