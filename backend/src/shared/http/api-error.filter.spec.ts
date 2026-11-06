import { ArgumentsHost } from '@nestjs/common';
import { ApiErrorFilter } from './api-error.filter';

describe('ApiErrorFilter', () => {
  it('returns a safe generic response for unknown errors', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, locals: {} }),
        getRequest: () => ({ headers: {} }),
      }),
    } as unknown as ArgumentsHost;
    new ApiErrorFilter().catch(new Error('password=secret database url'), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
        },
      }),
    );
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('secret');
  });
});
