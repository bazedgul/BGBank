import { createHash } from 'node:crypto';

export interface TransferRequestForHash {
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: bigint;
  currency: string;
  reference?: string;
}

export function canonicalizeTransferRequest(
  request: TransferRequestForHash,
): string {
  const currency = request.currency.trim().toUpperCase();
  const reference = request.reference?.trim() ?? null;
  return JSON.stringify({
    amountMinor: request.amountMinor.toString(),
    currency,
    destinationAccountId: request.destinationAccountId,
    reference,
    sourceAccountId: request.sourceAccountId,
  });
}

export function hashCanonicalRequest(canonicalRequest: string): string {
  return createHash('sha256').update(canonicalRequest, 'utf8').digest('hex');
}
