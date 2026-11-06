import argon2 from 'argon2';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(encodedHash: string, password: string): Promise<boolean>;
}

/**
 * The production adapter must be backed by an approved Argon2id package.
 * It intentionally fails closed until that dependency is installed and pinned.
 */
export class Argon2idPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    if (password.length < 12)
      throw new Error('password does not meet minimum length');
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify(encodedHash: string, password: string): Promise<boolean> {
    if (!encodedHash.startsWith('$argon2id$')) return false;
    try {
      return await argon2.verify(encodedHash, password);
    } catch {
      return false;
    }
  }
}
