import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export interface OpaqueToken {
  readonly value: string;
  readonly hash: string;
}

export function issueOpaqueToken(bytes = 32): OpaqueToken {
  if (!Number.isInteger(bytes) || bytes < 32) {
    throw new Error('opaque token size is too small');
  }

  const value = randomBytes(bytes).toString('base64url');
  return { value, hash: hashOpaqueToken(value) };
}

export function hashOpaqueToken(value: string): string {
  if (value.length === 0) throw new Error('opaque token cannot be empty');
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function equalOpaqueTokenHash(
  value: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(hashOpaqueToken(value), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
