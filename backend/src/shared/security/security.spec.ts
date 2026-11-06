import { equalOpaqueTokenHash, issueOpaqueToken } from './opaque-token';
import { isAllowedOrigin, issueCsrfToken, verifyCsrfToken } from './csrf';

describe('security primitives', () => {
  it('stores only a hash for an opaque token', () => {
    const token = issueOpaqueToken();
    expect(token.value).not.toEqual(token.hash);
    expect(equalOpaqueTokenHash(token.value, token.hash)).toBe(true);
    expect(equalOpaqueTokenHash(`${token.value}x`, token.hash)).toBe(false);
  });

  it('validates CSRF and configured origins', () => {
    const token = issueCsrfToken();
    expect(verifyCsrfToken(token.value, token.hash)).toBe(true);
    expect(verifyCsrfToken('wrong', token.hash)).toBe(false);
    expect(
      isAllowedOrigin('https://customer.example.test', [
        'https://customer.example.test',
      ]),
    ).toBe(true);
    expect(
      isAllowedOrigin('https://evil.example.test', [
        'https://customer.example.test',
      ]),
    ).toBe(false);
  });
});
