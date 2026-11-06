import type { Pool } from 'pg';

export interface OwnedAccount {
  id: string;
  accountNumberMasked: string;
  currency: string;
  status: string;
  ledgerBalanceMinor: string;
  availableBalanceMinor: string;
}

export interface TransactionRow {
  id: string;
  journalId: string;
  side: 'debit' | 'credit';
  amountMinor: string;
  currency: string;
  postedAt: Date;
  businessReference: string;
}

export class AccountsService {
  constructor(private readonly pool: Pool) {}

  async listOwnedAccounts(userId: string): Promise<OwnedAccount[]> {
    const result = await this.pool.query<OwnedAccount>({
      text: `SELECT a.id,
                    right(a.account_number, 4) AS "accountNumberMasked",
                    a.currency, a.status,
                    p.ledger_balance_minor::text AS "ledgerBalanceMinor",
                    p.available_balance_minor::text AS "availableBalanceMinor"
               FROM public.accounts a
               JOIN public.account_owners ao ON ao.account_id = a.id
               JOIN public.customers c ON c.id = ao.customer_id
               JOIN public.users u ON u.id = c.user_id
               JOIN public.account_balance_projections p ON p.account_id = a.id AND p.currency = a.currency
              WHERE u.id = $1
              ORDER BY a.id`,
      values: [userId],
    });
    return result.rows;
  }

  async listOwnedTransactions(
    userId: string,
    accountId: string,
    limit: number,
    cursor?: { postedAt: Date; id: string },
  ): Promise<TransactionRow[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const result = await this.pool.query<TransactionRow>({
      text: `SELECT e.id, e.journal_id AS "journalId", e.side, e.amount_minor::text AS "amountMinor", e.currency,
                    j.posted_at AS "postedAt", j.business_reference AS "businessReference"
               FROM public.journal_entries e
               JOIN public.journals j ON j.id = e.journal_id AND j.status = 'posted'
               JOIN public.accounts a ON a.ledger_account_id = e.ledger_account_id AND a.currency = e.currency
               JOIN public.account_owners ao ON ao.account_id = a.id
               JOIN public.customers c ON c.id = ao.customer_id
              WHERE c.user_id = $1 AND a.id = $2
                AND ($3::timestamptz IS NULL OR (j.posted_at, e.id) < ($3::timestamptz, $4::uuid))
              ORDER BY j.posted_at DESC, e.id DESC
              LIMIT $5`,
      values: [
        userId,
        accountId,
        cursor?.postedAt ?? null,
        cursor?.id ?? null,
        safeLimit,
      ],
    });
    return result.rows;
  }
}
