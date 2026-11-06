import argon2 from 'argon2';
import { Argon2idPasswordHasher } from './password-hasher';

jest.mock('argon2', () => ({
  __esModule: true,
  default: {
    argon2id: 2,
    hash: jest.fn().mockResolvedValue('$argon2id$v=19$test'),
    verify: jest.fn().mockResolvedValue(true),
  },
}));

describe('Argon2idPasswordHasher', () => {
  it('uses Argon2id and rejects weak passwords', async () => {
    const hasher = new Argon2idPasswordHasher();
    await expect(hasher.hash('short')).rejects.toThrow();
    await expect(
      hasher.hash('a sufficiently long password'),
    ).resolves.toContain('$argon2id$');
    expect(argon2.hash).toHaveBeenCalledWith(
      'a sufficiently long password',
      expect.objectContaining({ type: 2 }),
    );
  });

  it('fails closed for malformed hashes and verifies Argon2id hashes', async () => {
    const hasher = new Argon2idPasswordHasher();
    await expect(hasher.verify('not-a-hash', 'password')).resolves.toBe(false);
    await expect(
      hasher.verify('$argon2id$v=19$test', 'password'),
    ).resolves.toBe(true);
  });
});
