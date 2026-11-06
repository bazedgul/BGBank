import {
  canonicalizeTransferRequest,
  hashCanonicalRequest,
} from './canonical-request';

describe('transfer idempotency canonicalization', () => {
  it('normalizes currency and optional reference deterministically', () => {
    const first = canonicalizeTransferRequest({
      sourceAccountId: 'a',
      destinationAccountId: 'b',
      amountMinor: 10n,
      currency: ' usd ',
      reference: ' note ',
    });
    const second = canonicalizeTransferRequest({
      sourceAccountId: 'a',
      destinationAccountId: 'b',
      amountMinor: 10n,
      currency: 'USD',
      reference: 'note',
    });
    expect(first).toBe(second);
    expect(hashCanonicalRequest(first)).toHaveLength(64);
  });
});
