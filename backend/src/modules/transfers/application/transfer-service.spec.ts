import { TransferService, type TransferTransaction } from './transfer-service';

function transaction(): TransferTransaction {
  return {
    claimIdempotency: jest.fn().mockResolvedValue(null),
    lockAccountsInOrder: jest.fn().mockResolvedValue(undefined),
    assertOwnedAndEligible: jest.fn().mockResolvedValue({
      sourceLedgerAccountId: 'source-ledger',
      destinationLedgerAccountId: 'destination-ledger',
    }),
    createTransfer: jest.fn().mockResolvedValue('transfer-1'),
    createDraftJournal: jest.fn().mockResolvedValue('journal-1'),
    addJournalEntry: jest.fn().mockResolvedValue(undefined),
    postJournal: jest.fn().mockResolvedValue(undefined),
    markPosted: jest.fn().mockResolvedValue(undefined),
    writeAuditAndOutbox: jest.fn().mockResolvedValue(undefined),
    completeIdempotency: jest.fn().mockResolvedValue(undefined),
    rejectTransfer: jest.fn().mockResolvedValue(undefined),
  };
}

describe('TransferService', () => {
  it('locks deterministically and posts both sides before finalizing idempotency', async () => {
    const tx = transaction();
    const result = await new TransferService({
      run: (work) => work(tx),
    }).execute({
      actorUserId: 'user-1',
      sourceAccountId: 'z-account',
      destinationAccountId: 'a-account',
      amountMinor: 100n,
      currency: 'usd',
      idempotencyKey: 'key-1',
      requestId: 'request-1',
    });
    expect(tx.lockAccountsInOrder).toHaveBeenCalledWith([
      'a-account',
      'z-account',
    ]);
    expect(tx.addJournalEntry).toHaveBeenCalledTimes(2);
    expect(tx.postJournal).toHaveBeenCalledWith({
      journalId: 'journal-1',
      actorUserId: 'user-1',
      requestId: 'request-1',
    });
    expect(tx.completeIdempotency).toHaveBeenCalled();
    expect(result.state).toBe('completed');
  });

  it('does not perform financial work for a same-hash replay', async () => {
    const tx = transaction();
    (tx.claimIdempotency as jest.Mock).mockResolvedValue({
      transferId: 'existing',
      state: 'completed',
      journalId: 'journal',
      amountMinor: 1n,
      currency: 'USD',
    });
    const result = await new TransferService({
      run: (work) => work(tx),
    }).execute({
      actorUserId: 'user-1',
      sourceAccountId: 'a',
      destinationAccountId: 'b',
      amountMinor: 1n,
      currency: 'USD',
      idempotencyKey: 'key',
      requestId: 'request',
    });
    expect(result.transferId).toBe('existing');
    expect(tx.lockAccountsInOrder).not.toHaveBeenCalled();
    expect(tx.createDraftJournal).not.toHaveBeenCalled();
  });
});
