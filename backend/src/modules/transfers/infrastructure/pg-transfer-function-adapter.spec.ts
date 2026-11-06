import type { Pool } from 'pg';
import { PgTransferFunctionAdapter } from './pg-transfer-function-adapter';

describe('PgTransferFunctionAdapter', () => {
  it('pins identity verification and function invocation to one client and rolls back failures', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ session_user: 'bg_bank_app', current_user: 'bg_bank_app' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            result: {
              transferId: 't',
              state: 'completed',
              journalId: 'j',
              amountMinor: 1n,
              currency: 'USD',
            },
          },
        ],
      })
      .mockResolvedValueOnce({});
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    await expect(
      new PgTransferFunctionAdapter(pool).execute({
        actorUserId: 'u',
        sourceAccountId: 'a',
        destinationAccountId: 'b',
        amountMinor: 1n,
        currency: 'USD',
        idempotencyKey: 'k',
        requestId: 'r',
      }),
    ).resolves.toMatchObject({ transferId: 't' });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back on an identity mismatch', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ session_user: 'wrong', current_user: 'wrong' }],
      })
      .mockResolvedValueOnce({});
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    await expect(
      new PgTransferFunctionAdapter(pool).execute({
        actorUserId: 'u',
        sourceAccountId: 'a',
        destinationAccountId: 'b',
        amountMinor: 1n,
        currency: 'USD',
        idempotencyKey: 'k',
        requestId: 'r',
      }),
    ).rejects.toThrow('identity mismatch');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
