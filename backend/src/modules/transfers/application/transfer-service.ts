import {
  canonicalizeTransferRequest,
  hashCanonicalRequest,
} from '../../../shared/idempotency/canonical-request';
import { Money } from '../../../shared/money/money';
import { transition, type TransferState } from '../domain/transfer-state';

export interface TransferCommand {
  actorUserId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: bigint;
  currency: string;
  reference?: string;
  idempotencyKey: string;
  requestId: string;
}

export interface TransferResult {
  transferId: string;
  state: Extract<TransferState, 'completed'>;
  journalId: string;
  amountMinor: bigint;
  currency: string;
}

export interface TransferTransaction {
  claimIdempotency(
    scope: string,
    key: string,
    requestHash: string,
  ): Promise<TransferResult | null>;
  lockAccountsInOrder(accountIds: readonly string[]): Promise<void>;
  assertOwnedAndEligible(command: TransferCommand): Promise<{
    sourceLedgerAccountId: string;
    destinationLedgerAccountId: string;
  }>;
  createTransfer(command: TransferCommand): Promise<string>;
  createDraftJournal(input: {
    transferId: string;
    actorUserId: string;
    requestId: string;
  }): Promise<string>;
  addJournalEntry(input: {
    journalId: string;
    ledgerAccountId: string;
    side: 'debit' | 'credit';
    amountMinor: bigint;
    currency: string;
    position: number;
  }): Promise<void>;
  postJournal(input: {
    journalId: string;
    actorUserId: string;
    requestId: string;
  }): Promise<void>;
  markPosted(transferId: string, journalId: string): Promise<void>;
  writeAuditAndOutbox(input: {
    transferId: string;
    actorUserId: string;
    requestId: string;
  }): Promise<void>;
  completeIdempotency(
    scope: string,
    key: string,
    result: TransferResult,
  ): Promise<void>;
  rejectTransfer(
    transferId: string,
    requestId: string,
    reason: string,
  ): Promise<void>;
}

/** The runner must BEGIN before invoking work, COMMIT on success, and ROLLBACK
 * on every rejection. No caller may observe a successful result before COMMIT. */
export interface TransferTransactionRunner {
  run<T>(work: (transaction: TransferTransaction) => Promise<T>): Promise<T>;
}

export class TransferService {
  constructor(private readonly runner: TransferTransactionRunner) {}

  async execute(command: TransferCommand): Promise<TransferResult> {
    if (!command.idempotencyKey.trim())
      throw new Error('idempotency key is required');
    if (command.sourceAccountId === command.destinationAccountId)
      throw new Error('self transfer is not allowed');
    const money = Money.of(command.amountMinor, command.currency);
    const canonical = canonicalizeTransferRequest(command);
    const requestHash = hashCanonicalRequest(canonical);
    const accountIds = [
      command.sourceAccountId,
      command.destinationAccountId,
    ].sort();

    return this.runner.run(async (transaction) => {
      const replay = await transaction.claimIdempotency(
        'customer-transfer',
        command.idempotencyKey,
        requestHash,
      );
      if (replay) return replay;
      await transaction.lockAccountsInOrder(accountIds);
      const ledger = await transaction.assertOwnedAndEligible(command);
      const transferId = await transaction.createTransfer(command);
      const journalId = await transaction.createDraftJournal({
        transferId,
        actorUserId: command.actorUserId,
        requestId: command.requestId,
      });
      await transaction.addJournalEntry({
        journalId,
        ledgerAccountId: ledger.sourceLedgerAccountId,
        side: 'debit',
        amountMinor: money.minor,
        currency: money.currency,
        position: 1,
      });
      await transaction.addJournalEntry({
        journalId,
        ledgerAccountId: ledger.destinationLedgerAccountId,
        side: 'credit',
        amountMinor: money.minor,
        currency: money.currency,
        position: 2,
      });
      await transaction.postJournal({
        journalId,
        actorUserId: command.actorUserId,
        requestId: command.requestId,
      });
      await transaction.markPosted(transferId, journalId);
      transition('posted', 'completed');
      const result: TransferResult = {
        transferId,
        state: 'completed',
        journalId,
        amountMinor: money.minor,
        currency: money.currency,
      };
      await transaction.writeAuditAndOutbox({
        transferId,
        actorUserId: command.actorUserId,
        requestId: command.requestId,
      });
      await transaction.completeIdempotency(
        'customer-transfer',
        command.idempotencyKey,
        result,
      );
      return result;
    });
  }
}
