# Database Design

PostgreSQL (see ADR-0001). This document defines conventions and the core model; detailed ERDs are added per phase.

## Conventions
- `snake_case`, plural tables, UUID (or ULID) primary keys, `created_at`/`updated_at` (UTC `timestamptz`).
- Money: `amount_minor BIGINT` + `currency CHAR(3)`; FX rate `NUMERIC(18,8)`.
- Statuses as constrained text/enum with CHECK; transitions recorded in `*_status_history`.
- FKs everywhere; CHECK constraints for invariants (e.g. `amount_minor > 0`).
- Index from real query patterns (FKs, `(account_id, posted_at DESC)`, idempotency uniques).
- Migrations only; each reviewed; backwards-compatible where possible.
- Soft-delete **never** for financial rows; they're immutable.

## Core tables (initial sketch)
| Table | Purpose |
|---|---|
| `customers`, `customer_kyc` | Identity, KYC tier/status |
| `accounts` | Customer account: type, currency, status, `ledger_account_id` |
| `ledger_accounts` | **Chart of accounts**: code, name, type (asset/liability/equity/income/expense), normal side, parent (control→sub-ledger), currency |
| `journals` | One per business event: id, type, reference (transfer/payment), `reverses_journal_id`, posted_at, status |
| `journal_entries` | Immutable lines: journal_id, ledger_account_id, side (D/C), amount_minor, currency. **Constraint (deferred/trigger): per journal Σdebits = Σcredits** |
| `balances` | Synchronous cached ledger balance per ledger account with version; updated in the posting transaction and rebuildable from entries. Computed-on-read balances are diagnostic/reconstruction tools, not the primary Phase 1 runtime approach |
| `holds` | Authorization holds: account, amount, reason, state (active/released/captured/expired), expires_at |
| `transfers` | Business transfer: source, destination/beneficiary, amount, state, idempotency ref |
| `transfer_state_history` | Every transition with actor/reason |
| `idempotency_keys` | scope, key, request_hash, response, status, expires_at; UNIQUE(scope,key) |
| `beneficiaries` | Owner, details, status, `active_from` (cooling period), verified_at |
| `limits_config`, `limit_usage` | Region/tier config; rolling usage counters |
| `payment_attempts` | Per rail submission: provider ref, status, raw response, unknown flag |
| `fx_quotes` | Snapshot: pair, rate, spread, fee, expires_at, status (issued/executed/expired) |
| `approval_requests` | Maker-checker: action, payload, payload_hash, requested_by, approved_by (CHECK ≠), status, expires_at |
| `outbox_events` | Transactional outbox |
| `audit_log` | Append-only; who/what/when/before/after/request_id |
| `fraud_decisions`, `aml_alerts`, `cases` | Risk/compliance |
| `reconciliation_runs`, `reconciliation_items` | Matching results and breaks |
| `ai_action_log` | Agent, tool, permission check, inputs/outputs refs |

## Invariants (must be enforced and tested)
1. Every journal: Σdebits = Σcredits (same currency per journal, or FX via explicit FX accounts).
2. `journal_entries` are append-only (revoke UPDATE/DELETE; trigger as backstop).
3. Trial balance totals to zero debit-credit difference.
4. Σ(customer sub-ledger balances) = Customer Deposits control account.
5. `available = ledger − Σ active holds ≥ 0` (unless overdraft policy says otherwise).
6. A journal can be reversed at most once; reversal references the original.
7. `approval_requests`: `requested_by ≠ approved_by`.
8. One idempotency key → one outcome.
9. Quote executes only if `now < expires_at` and status = issued; executes at the **stored** rate.

## Transfer SQL flow (reference)
```sql
BEGIN;
-- 1. idempotency: INSERT ... ON CONFLICT DO NOTHING; if existing, compare request_hash
-- 2. lock in deterministic order
SELECT id, status, version FROM accounts WHERE id IN ($a,$b) ORDER BY id FOR UPDATE;
-- 3. verify statuses, compute available = ledger - active holds, check >= amount
-- 4. INSERT journals; INSERT journal_entries (debit src, credit dst [+ fee lines])
-- 5. UPDATE balances; UPDATE transfers state; INSERT transfer_state_history
-- 6. INSERT audit_log; INSERT outbox_events
COMMIT;
```
External payments: place **hold** + create `payment_attempt` *outside* long locks; post to clearing on submit; settle/reverse on outcome.

## Seed/reference data
Chart of accounts seed (customer deposits, cash/nostro clearing, suspense, fee income, interest expense, FX gain/loss), currency exponents, region configs, test fixtures — all via migrations/seed scripts, never ad-hoc.
## Approved enforcement design

ADR-0006 records the accepted design for controlled journal creation and posting. Separate database functions create draft journals, add draft entries, and post journals. `post_journal()` validates at least two entries, positive amounts, account/currency relationships, and debit-credit equality independently per currency. A deferred constraint trigger validates the final state at transaction commit. Posted journals and entries are protected by append-only triggers.

The runtime application role does not own ledger tables and does not receive unrestricted UPDATE or DELETE privileges. Privileged functions use a fixed safe `search_path` and restricted EXECUTE grants. Exact role names, ownership migrations and function signatures remain implementation details.

## Idempotency and sessions

Financial writes use `UNIQUE(scope, key)` in `idempotency_keys`. The validated, canonical request hash, final response status/body and resource reference are stored in the same transaction as the transfer, journal, state history, audit and outbox records. Successful operations and deterministic business rejections initially use the same retention policy.

Browser authentication uses PostgreSQL-backed opaque sessions. Only a hash of the random session token is stored. The session table will include principal, expiry, idle activity, revocation, device metadata and authentication level. Customer and admin timeout recommendations are recorded in ADR-0005; exact schema and operational limits remain unresolved.

## Balance projections and reconstruction

Posted entries remain authoritative. A synchronous balance projection may be updated in the same posting transaction, but it must be rebuildable. A controlled reconstruction groups all posted entries by ledger account and currency, compares the result with projections, records mismatches, and permits repair only through an authorized operational procedure. It never edits journal history.

Available balance is derived as posted ledger balance minus active holds. Spending operations lock the relevant account and holds; multi-account operations lock account rows in deterministic order. The full hold lifecycle is a planned Phase 2 implementation; Phase 1 same-currency internal transfers post atomically without pending holds.

## Currency-specific control accounts

Customer deposit control accounts are currency-specific, for example `Customer Deposits — PKR` and `Customer Deposits — USD`. Each customer's currency wallet is a sub-ledger under the matching control account. Reconciliation is performed independently per currency. FX uses linked currency-specific journals and explicit fee, spread, rounding and FX gain/loss accounts; currencies are never balanced merely by matching numeric values.
