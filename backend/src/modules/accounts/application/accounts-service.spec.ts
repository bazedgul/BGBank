import type { Pool } from 'pg';
import { AccountsService } from './accounts-service';

describe('AccountsService', () => {
  it('queries only accounts owned through the authenticated customer', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [{ id: 'a', availableBalanceMinor: '10' }],
      }),
    } as unknown as Pool;
    await expect(
      new AccountsService(pool).listOwnedAccounts('user-1'),
    ).resolves.toEqual([{ id: 'a', availableBalanceMinor: '10' }]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.objectContaining({ values: ['user-1'] }),
    );
    expect((pool.query as jest.Mock).mock.calls[0][0].text).toContain(
      'account_owners',
    );
  });

  it('bounds transaction history page size', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;
    await new AccountsService(pool).listOwnedTransactions(
      'user-1',
      'account-1',
      1000,
    );
    expect((pool.query as jest.Mock).mock.calls[0][0].values[4]).toBe(100);
  });
});
