# System Architecture

## Style
**Modular monolith** with strict domain boundaries, **ports & adapters** for anything external, and an **event outbox** for cross-module side effects. Split into services only if a real need appears (YAGNI).

```
            ┌──────────── Customer App ────────────┐  ┌──── Admin Portal ────┐
            │  (React + TS)                         │  │ Ops | Compliance | Finance │
            └───────────────┬───────────────────────┘  └──────────┬───────────┘
                            ▼                                      ▼
                    API layer (thin controllers, authN/Z, validation)
   ┌────────────────────────────────────────────────────────────────────────┐
   │ Application services (use cases)                                       │
   │ identity | customers | kyc | accounts | ledger | payments | beneficiaries│
   │ limits | cards | bills | fx | risk | compliance | notifications |       │
   │ reconciliation | statements | admin(approvals) | audit | ai            │
   └───────┬──────────────────┬───────────────────┬─────────────────────────┘
           │ ports            │ ports              │ ports
     Payment rails       KYC providers        Regulation rules
   (Raast, IBFT, SEPA)  (CNIC, Passport)     (SBP-style, EU-style)   ← adapters/config
           ▼
   PostgreSQL (ledger, state, outbox, audit)  ·  Worker (outbox, schedulers)
```

## Domain responsibilities
| System | Responsibility |
|---|---|
| **Ledger** (single, with chart of accounts) | Journals, entries, balances, holds, trial balance. Customer accounts = sub-ledgers under a control account. |
| Payments | Transfer/payment lifecycle, orchestration, retries, returns |
| Risk | Fraud rules and scoring (decision + reasons) |
| Compliance | KYC/AML workflows and cases |
| Limits | Limit evaluation, per KYC tier and region config |
| FX | Quotes (snapshot + expiry), spreads |
| Admin | Maker-checker approvals, operational actions |
| Audit | Immutable log of sensitive actions |
| AI | Analysis, explanation, recommendation via permissioned tools |

Modules communicate via **public service APIs** and **domain events**. No module reads or writes another module's tables.

## Reference flow: Phase 1 internal transfer
```
Client → API (Idempotency-Key)
 → authN/Z (object-level: caller owns source account)
 → validate input, resolve beneficiary rules (cooling period, blocked)
 → limits check → risk decision (rules; AI may only add explanation)
 → BEGIN
     → idempotency record (unique key; same key + different payload = 409)
     → lock both accounts in deterministic order
     → verify state + available balance
     → create journal + 2 entries (debit/credit) [+ fee entries]
     → update transfer state, write audit + outbox event
   COMMIT
 → outbox worker → notifications, analytics, webhooks
```

## External payment flow (simulated rail, planned Phase 2 behavior)
`created → risk_approved → hold_placed → submitted → (settled | failed | returned | unknown)`
- `unknown` (timeout): funds stay in **clearing/suspense**; reconciliation job resolves; **no blind retry**.
- `failed/returned`: reverse via reversal journal referencing original; release hold.

## Region configuration
Per-jurisdiction config (DB/JSON): currencies, limits by KYC tier, reporting thresholds, enabled rails, KYC requirements, languages. New region = new config + adapters, **not** core changes.

## Operational resilience
Circuit breaker per provider; health status; route new eligible payments to alternates; recover pending/unknown after provider returns; every transition audited.

## Admin portal
One portal, role-based sections: **Operations** (failed payments, returns, reconciliation), **Compliance** (KYC queue, AML alerts, cases), **Finance** (GL, trial balance, fees). Add Risk and AI Control Center later.

## AI layer
Separate module. Reads through scoped tools, produces recommendations/explanations, requests actions through the same deterministic APIs as a human would, subject to the same checks. See `AI_AGENT_GUIDELINES.md`.

## Cross-cutting
Request IDs, structured logging, config validation, error model, rate limiting, observability hooks.

## Approved decision boundaries

Financial writes use one transaction for the idempotency record, transfer, journal, journal entries, state history, audit event, outbox event and final response. A lost HTTP response is recovered by retrying the same idempotency key; a committed result is replayed and a rolled-back transaction leaves no outcome.

The browser uses an opaque server-side session cookie. The API validates the session, CSRF token and origin before state-changing requests. The frontend never decides authorization or financial validity.

Ledger creation and posting use separate controlled PostgreSQL functions. A deferred constraint trigger validates the final journal state, append-only triggers protect posted records, and restricted database roles prevent the runtime application from directly mutating ledger tables. Each currency balances independently. Synchronous balance projections are updated in the posting transaction but remain rebuildable from posted entries.

Phase 1 ordinary same-currency internal transfers use immediate atomic posting: `created → posted → completed`. Synchronous balance projections update in the same transaction, while ledger entries remain authoritative. Risk review, approval, the full hold lifecycle, and external pending flows are planned future behavior and are not Phase 1 implementation.
