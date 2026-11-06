import { issueCsrfToken } from '../../../shared/security/csrf';
import { authorizeCookieMutation, sessionCookieOptions } from './http-security';

describe('HTTP session security', () => {
  it('uses an HttpOnly cookie and secure production policy', () => {
    expect(sessionCookieOptions(true, 1800)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1800,
    });
  });

  it('requires an allowed origin and matching CSRF token', () => {
    const csrf = issueCsrfToken();
    expect(() =>
      authorizeCookieMutation({
        origin: 'https://app.test',
        allowedOrigins: ['https://app.test'],
        csrfToken: csrf.value,
        csrfHash: csrf.hash,
      }),
    ).not.toThrow();
    expect(() =>
      authorizeCookieMutation({
        origin: 'https://evil.test',
        allowedOrigins: ['https://app.test'],
        csrfToken: csrf.value,
        csrfHash: csrf.hash,
      }),
    ).toThrow();
  });
});
