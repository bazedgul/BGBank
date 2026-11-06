import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { IdentityService } from '../../identity/application/identity-service';
import { authorizeCookieMutation } from '../../identity/api/http-security';
import { sessionCookieValue } from '../../identity/api/identity.controller';
import { PgTransferFunctionAdapter } from '../infrastructure/pg-transfer-function-adapter';
import { ApiRequestError } from '../../../shared/http/api-request-error';

@Controller('transfers')
export class TransferController {
  constructor(
    private readonly identity: IdentityService,
    private readonly transfer: PgTransferFunctionAdapter,
  ) {}

  @Post()
  async create(
    @Req() request: Request,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 255)
      throw new ApiRequestError(
        400,
        'VALIDATION_FAILED',
        'The request is invalid.',
      );
    const token = sessionCookieValue(request);
    if (!token)
      throw new ApiRequestError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required.',
      );
    const session = await this.identity.loadSession(token);
    authorizeCookieMutation({
      origin,
      allowedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:5173'],
      csrfToken,
      csrfHash: session.csrfTokenHash,
    });
    if (
      typeof body.sourceAccountId !== 'string' ||
      typeof body.destinationAccountId !== 'string' ||
      typeof body.currency !== 'string' ||
      typeof body.amountMinor !== 'string' ||
      (typeof body.reference !== 'undefined' &&
        typeof body.reference !== 'string')
    )
      throw new ApiRequestError(
        400,
        'VALIDATION_FAILED',
        'The request is invalid.',
      );
    let amountMinor: bigint;
    try {
      amountMinor = BigInt(body.amountMinor);
    } catch {
      throw new ApiRequestError(
        400,
        'VALIDATION_FAILED',
        'The request is invalid.',
      );
    }
    if (amountMinor <= 0n)
      throw new ApiRequestError(
        400,
        'VALIDATION_FAILED',
        'The request is invalid.',
      );
    return {
      data: await this.transfer.execute({
        actorUserId: session.userId,
        sourceAccountId: body.sourceAccountId,
        destinationAccountId: body.destinationAccountId,
        amountMinor,
        currency: body.currency,
        reference: body.reference as string | undefined,
        idempotencyKey,
        requestId: request.headers['x-request-id']?.toString() ?? randomUUID(),
      }),
    };
  }
}
