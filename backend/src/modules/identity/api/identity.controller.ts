import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { IdentityService } from '../application/identity-service';
import { IDENTITY_PORT, type IdentityPort } from './identity-client';
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  authorizeCookieMutation,
} from './http-security';
import { isAllowedOrigin } from '../../../shared/security/csrf';
import { ApiRequestError } from '../../../shared/http/api-request-error';

export function sessionCookieValue(request: Request): string | undefined {
  const header = request.headers.cookie ?? '';
  return header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
}

@Controller('auth')
export class IdentityController {
  constructor(
    @Inject(IDENTITY_PORT)
    private readonly identity: IdentityService | IdentityPort,
  ) {}

  @Post('session')
  @HttpCode(201)
  async login(
    @Body() body: { identifier?: unknown; password?: unknown },
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (
      typeof body.identifier !== 'string' ||
      typeof body.password !== 'string'
    )
      throw new ApiRequestError(
        400,
        'VALIDATION_FAILED',
        'The request is invalid.',
      );
    if (
      !isAllowedOrigin(origin, [
        process.env.FRONTEND_URL ?? 'http://localhost:5173',
      ])
    )
      throw new ApiRequestError(
        403,
        'ORIGIN_REJECTED',
        'The request origin was rejected.',
      );
    const result = await this.identity.authenticate(
      body.identifier,
      body.password,
    );
    response.cookie(
      SESSION_COOKIE_NAME,
      result.token,
      sessionCookieOptions(
        process.env.NODE_ENV === 'production',
        7 * 24 * 60 * 60,
      ),
    );
    return {
      data: { userId: result.user.id, csrfToken: result.csrfToken },
      requestId: response.locals.requestId,
    };
  }

  @Delete('session')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Headers('origin') origin: string | undefined,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = sessionCookieValue(request);
    if (!token) return;
    const session = await this.identity.loadSession(token);
    authorizeCookieMutation({
      origin,
      allowedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:5173'],
      csrfToken,
      csrfHash: session.csrfTokenHash,
    });
    await this.identity.logout(token);
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  @Post('session/rotate')
  async rotate(
    @Req() request: Request,
    @Headers('origin') origin: string | undefined,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = sessionCookieValue(request);
    if (!token)
      throw new ApiRequestError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required.',
      );
    const current = await this.identity.loadSession(token);
    authorizeCookieMutation({
      origin,
      allowedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:5173'],
      csrfToken,
      csrfHash: current.csrfTokenHash,
    });
    const result = await this.identity.rotate(token);
    response.cookie(
      SESSION_COOKIE_NAME,
      result.token,
      sessionCookieOptions(
        process.env.NODE_ENV === 'production',
        7 * 24 * 60 * 60,
      ),
    );
    return {
      data: { csrfToken: result.csrfToken },
      requestId: response.locals.requestId,
    };
  }

  @Post('sessions/revoke-all')
  @HttpCode(204)
  async logoutAll(
    @Req() request: Request,
    @Headers('origin') origin: string | undefined,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = sessionCookieValue(request);
    if (!token)
      throw new ApiRequestError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required.',
      );
    const current = await this.identity.loadSession(token);
    authorizeCookieMutation({
      origin,
      allowedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:5173'],
      csrfToken,
      csrfHash: current.csrfTokenHash,
    });
    await this.identity.logoutAll(token);
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }
}
