import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthenticationError } from '../../modules/identity/application/identity-service';
import { ApiRequestError } from './api-request-error';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const requestId =
      request.headers['x-request-id']?.toString() ?? response.locals.requestId;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    if (exception instanceof ApiRequestError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof AuthenticationError) {
      status = HttpStatus.UNAUTHORIZED;
      code = 'AUTHENTICATION_REQUIRED';
      message = 'Authentication is required.';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      if (status < 500) {
        code =
          status === 400
            ? 'VALIDATION_FAILED'
            : status === 403
              ? 'FORBIDDEN'
              : 'REQUEST_REJECTED';
        message =
          status === 400
            ? 'The request is invalid.'
            : 'The request was rejected.';
      }
    } else if (
      exception instanceof Error &&
      ['authentication required', 'authentication failed'].includes(
        exception.message,
      )
    ) {
      status = HttpStatus.UNAUTHORIZED;
      code = 'AUTHENTICATION_REQUIRED';
      message = 'Authentication is required.';
    }
    response.status(status).json({ error: { code, message }, requestId });
  }
}
