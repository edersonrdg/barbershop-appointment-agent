import { ScryptPasswordHasher } from './scrypt-password-hasher';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it("CA-01.1: hash does not contain the plain password and starts with 'scrypt$'", async () => {
    const plain = 'minha-senha-secreta';
    const hash = await hasher.hash(plain);

    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).not.toContain(plain);
  });

  it('CA-01.1: two hashes of the same password differ (random salt)', async () => {
    const plain = 'minha-senha-secreta';
    const [hashA, hashB] = await Promise.all([
      hasher.hash(plain),
      hasher.hash(plain),
    ]);

    expect(hashA).not.toBe(hashB);
  });

  it('verify accepts the correct password', async () => {
    const hash = await hasher.hash('senha-correta');

    await expect(hasher.verify('senha-correta', hash)).resolves.toBe(true);
  });

  it('verify rejects the wrong password', async () => {
    const hash = await hasher.hash('senha-correta');

    await expect(hasher.verify('senha-errada', hash)).resolves.toBe(false);
  });

  it('verify returns false (not throw) for a malformed hash', async () => {
    await expect(
      hasher.verify('qualquer-senha', 'not-a-valid-hash'),
    ).resolves.toBe(false);
  });
});
