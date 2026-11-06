import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { issueOpaqueToken } from './opaque-token';

export function issueCsrfToken(): { value: string; hash: string } {
  return issueOpaqueToken(32);
}

export function hashCsrfToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function verifyCsrfToken(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashCsrfToken(value), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  return origin !== undefined && allowedOrigins.includes(origin);
}
