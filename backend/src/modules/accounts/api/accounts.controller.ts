import { Controller, Get, Headers, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IdentityService } from '../../identity/application/identity-service';
import { sessionCookieValue } from '../../identity/api/identity.controller';
import { AccountsService } from '../application/accounts-service';
import { ApiRequestError } from '../../../shared/http/api-request-error';

@Controller('me/accounts')
export class AccountsController {
  constructor(
    private readonly identity: IdentityService,
    private readonly accounts: AccountsService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const token = sessionCookieValue(request);
    if (!token)
      throw new ApiRequestError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required.',
      );
    const session = await this.identity.loadSession(token);
    return { data: await this.accounts.listOwnedAccounts(session.userId) };
  }

  @Get(':accountId/transactions')
  async transactions(
    @Req() request: Request,
    @Param('accountId') accountId: string,
    @Query('limit') limit?: string,
    @Headers('x-cursor-posted-at') cursorPostedAt?: string,
    @Headers('x-cursor-id') cursorId?: string,
  ) {
    const token = sessionCookieValue(request);
    if (!token)
      throw new ApiRequestError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required.',
      );
    const session = await this.identity.loadSession(token);
    const parsedLimit = limit === undefined ? 50 : Number(limit);
    if (
      !Number.isSafeInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 100
    )
      throw new ApiRequestError(
        400,
        'VALIDATION_FAILED',
        'The request is invalid.',
      );
    const cursor =
      cursorPostedAt && cursorId
        ? { postedAt: new Date(cursorPostedAt), id: cursorId }
        : undefined;
    if (cursor && Number.isNaN(cursor.postedAt.getTime()))
      throw new ApiRequestError(
        400,
        'VALIDATION_FAILED',
        'The request is invalid.',
      );
    return {
      data: await this.accounts.listOwnedTransactions(
        session.userId,
        accountId,
        parsedLimit,
        cursor,
      ),
    };
  }
}
