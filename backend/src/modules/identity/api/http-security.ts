import {
  isAllowedOrigin,
  verifyCsrfToken,
} from '../../../shared/security/csrf';
import { ApiRequestError } from '../../../shared/http/api-request-error';

export const SESSION_COOKIE_NAME = 'bg_bank_session';

export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax' | 'strict';
  path: '/';
  maxAge: number;
}

export function sessionCookieOptions(
  isProduction: boolean,
  maxAgeSeconds: number,
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function authorizeCookieMutation(input: {
  origin?: string;
  allowedOrigins: readonly string[];
  csrfToken?: string;
  csrfHash: string;
}): void {
  if (!isAllowedOrigin(input.origin, input.allowedOrigins))
    throw new ApiRequestError(
      403,
      'ORIGIN_REJECTED',
      'The request origin was rejected.',
    );
  if (!input.csrfToken || !verifyCsrfToken(input.csrfToken, input.csrfHash))
    throw new ApiRequestError(
      403,
      'CSRF_REJECTED',
      'The request could not be verified.',
    );
}
