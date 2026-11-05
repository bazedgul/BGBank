# Banking Domain Model

Plain-language reference. The owner is learning — keep this accurate and readable.

## Glossary
| Term | Meaning |
|---|---|
| Ledger | Append-only record of all money movements (journals + entries) |
| Journal / entry | A business event = one journal with ≥2 entries (debits & credits) |
| Chart of accounts | List of ledger accounts by type: asset, liability, equity, income, expense |
| Control account / sub-ledger | "Customer Deposits" liability account whose detail is each customer's sub-ledger account |
| Ledger balance | Sum of posted entries |
| Available balance | Ledger balance − active holds |
| Hold | Funds reserved but not yet posted (e.g. card authorization, in-flight payment) |
| Posting | Making an entry permanent in the ledger |
| Reversal | New journal that cancels an earlier one, referencing it |
| Adjustment | Correcting journal with reason and approval |
| Suspense account | Temporary account for unexplained/uncertain items |
| Clearing/settlement account | Intermediate account while a payment is in transit |
| Reconciliation | Matching our records against an external statement; unmatched = "breaks" |
| Idempotency | Repeating a request has no extra effect |
| KYC / AML | Know-your-customer / anti-money-laundering |
| Maker-checker | One person requests, a different person approves |
| Rail | Payment network (Raast, IBFT, SEPA, SWIFT…) — simulated here |
| ROSCA ("committee") | Rotating savings group |

## Double-entry in one example
Ali sends PKR 1,000 to Sara (both customers):
```
Debit  Customer Deposits – Ali   1,000   (liability decreases)
Credit Customer Deposits – Sara  1,000   (liability increases)
```
With a PKR 10 fee: also `Debit Ali 10` / `Credit Fee Income 10`. Sum of debits = sum of credits always.

## Account lifecycle
`pending → active ⇄ frozen`, `active → dormant → active`, `active|frozen|dormant → closed` (balance must be zero; closed is terminal). Freeze/unfreeze/close require maker-checker when initiated by staff.

## Transfer state machine
```
created → risk_review → approved → hold_placed → posted → settled
              │             │          │
              └─ rejected   └─ cancelled (only before posting)
posted → reversed (via reversal journal)
external: submitted → settled | failed | returned | unknown(→reconciled)
```
Cancellation allowed only in states before `submitted`/`posted` per rules.

## Holds (planned Phase 2 behavior)
`active → released | captured | expired`. Capture converts the hold into a posted journal. Holds reduce available balance immediately.

The hold model is documented for future pending and external-payment flows. It is not part of the Phase 1 implementation. Phase 1 ordinary same-currency internal transfers post atomically without a pending hold.

## Suspense / clearing usage (planned future behavior)
Outgoing external payment: on submit, move funds customer → **clearing**. On settlement: clearing → external/nostro. On failure/return: reversal clearing → customer. On **unknown**: remain in clearing/suspense and flag for reconciliation. Nothing is "lost": every difference sits in a named account until explained.

## Beneficiary rules
1. Customer adds beneficiary → verification (simulated name check/OTP).
2. **Cooling period** (e.g. 24h, configurable) before large transfers.
3. Daily limit for new beneficiaries; block/unblock supported.
4. First transfer to a new beneficiary → extra fraud check.

## Limits
Per-transaction, daily, monthly, velocity (count/time window), per-beneficiary; values depend on KYC tier and region config. Limit usage is updated atomically with the transfer.

## Maker-checker
Sensitive actions (freeze/unfreeze, manual adjustment, limit override, close account, change region config). Flow: maker creates `approval_request` (payload + hash) → different checker approves/rejects → system executes with the **approved payload only** → all steps audited. Requests expire.

## FX quote lifecycle
`issued → executed | expired | cancelled`. Quote stores pair, mid rate, spread, fee, total, `expires_at`. Execution uses the **stored** numbers. Treasury exposure tracked per currency.

## Cross-border remittance (UK → PK example)
Customer requests → orchestrator picks corridor/rail, fee, ETA → FX quote shown → customer confirms → hold + debit → rail submit (simulated) → settlement/credit in PKR → notifications. Failure paths: quote expired, rail down (fallback), unknown outcome (suspense + reconcile), return.

## Reconciliation
Import simulated provider statement → match by reference/amount/date → classify: matched, missing-on-our-side, missing-on-provider, amount mismatch → create investigation items → post adjustments through maker-checker.

## Returns
External rail returns a payment with a code → investigation → reversal to customer (or re-route) with audit.

## Escrow (P3)
`created → funded (hold) → conditions_met → released | refunded | expired | disputed`. Funds are held, not available to seller until release; time-based expiry and dispute window.

## Committee/ROSCA (P3)
Group, members, contribution schedule, payout turn order, default handling; all money via normal ledger journals.

## Compliance concepts
KYC tiers gate limits and features; AML rules produce **alerts**, alerts become **cases** worked by compliance staff; suspicious-activity decisions are human.
