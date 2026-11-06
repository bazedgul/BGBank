import type { Pool } from 'pg';
import type {
  TransferCommand,
  TransferResult,
} from '../application/transfer-service';
import {
  canonicalizeTransferRequest,
  hashCanonicalRequest,
} from '../../../shared/idempotency/canonical-request';

export class PgTransferFunctionAdapter {
  constructor(
    private readonly pool: Pool,
    private readonly expectedLoginRole = 'bg_bank_app',
  ) {}

  async execute(command: TransferCommand): Promise<TransferResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SET LOCAL statement_timeout = '5s'; SET LOCAL lock_timeout = '1s';`,
      );
      const identity = await client.query<{
        session_user: string;
        current_user: string;
      }>('SELECT session_user, current_user');
      if (
        identity.rows[0]?.session_user !== this.expectedLoginRole ||
        identity.rows[0]?.current_user !== this.expectedLoginRole
      ) {
        throw new Error('transfer connection identity mismatch');
      }
      const result = await client.query<{ result: TransferResult }>({
        text: `SELECT public.execute_internal_transfer($1, $2, $3, $4, $5, $6, $7, $8, $9) AS result`,
        values: [
          command.actorUserId,
          command.sourceAccountId,
          command.destinationAccountId,
          command.amountMinor.toString(),
          command.currency,
          command.reference ?? null,
          command.idempotencyKey,
          hashCanonicalRequest(canonicalizeTransferRequest(command)),
          command.requestId,
        ],
      });
      await client.query('COMMIT');
      return result.rows[0].result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* preserve original failure */
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
