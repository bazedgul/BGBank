import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Buffer } from 'node:buffer';
import { IdentityService } from '../application/identity-service';

@Controller('internal/v1')
export class IdentityRpcController {
  constructor(
    private readonly identity: IdentityService,
    private readonly config: ConfigService,
  ) {}

  private authorize(value: string | undefined): void {
    const expected = this.config.getOrThrow<string>(
      'IDENTITY_SERVICE_AUTH_TOKEN',
    );
    const actual = value?.startsWith('Bearer ') ? value.slice(7) : '';
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new UnauthorizedException();
  }
  private request(
    body: unknown,
    fields: Record<string, { min: number; max: number }>,
  ): Record<string, string> {
    if (!body || typeof body !== 'object') throw new UnauthorizedException();
    const value = body as Record<string, unknown>;
    if (
      Object.keys(value).some(
        (key) => !Object.prototype.hasOwnProperty.call(fields, key),
      )
    )
      throw new UnauthorizedException();
    for (const [key, limits] of Object.entries(fields)) {
      if (
        typeof value[key] !== 'string' ||
        value[key].length < limits.min ||
        value[key].length > limits.max
      )
        throw new UnauthorizedException();
    }
    return value as Record<string, string>;
  }

  @Post('authenticate')
  async authenticate(
    @Headers('authorization') auth: string | undefined,
    @Body() body: { identifier: string; password: string },
  ) {
    this.authorize(auth);
    const input = this.request(body, {
      identifier: { min: 1, max: 320 },
      password: { min: 1, max: 1024 },
    });
    const result = await this.identity.authenticate(
      input.identifier,
      input.password,
    );
    return {
      user: result.user,
      token: result.token,
      csrfToken: result.csrfToken,
    };
  }
  @Post('session/validate')
  @HttpCode(200)
  async validate(
    @Headers('authorization') auth: string | undefined,
    @Body() body: { token: string },
  ) {
    this.authorize(auth);
    const input = this.request(body, { token: { min: 32, max: 4096 } });
    const session = await this.identity.loadSession(input.token);
    return {
      id: session.id,
      userId: session.userId,
      csrfTokenHash: session.csrfTokenHash,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    };
  }
  @Post('session/logout')
  @HttpCode(204)
  async logout(
    @Headers('authorization') auth: string | undefined,
    @Body() body: { token: string },
  ) {
    this.authorize(auth);
    const input = this.request(body, { token: { min: 32, max: 4096 } });
    await this.identity.logout(input.token);
  }
  @Post('session/rotate')
  async rotate(
    @Headers('authorization') auth: string | undefined,
    @Body() body: { token: string },
  ) {
    this.authorize(auth);
    const input = this.request(body, { token: { min: 32, max: 4096 } });
    const result = await this.identity.rotate(input.token);
    return { token: result.token, csrfToken: result.csrfToken };
  }
  @Post('session/logout-all')
  @HttpCode(204)
  async logoutAll(
    @Headers('authorization') auth: string | undefined,
    @Body() body: { token: string },
  ) {
    this.authorize(auth);
    const input = this.request(body, { token: { min: 32, max: 4096 } });
    await this.identity.logoutAll(input.token);
  }
}
