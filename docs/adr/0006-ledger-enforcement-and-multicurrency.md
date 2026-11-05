# ADR 0006: Ledger enforcement and multi-currency accounting

- **Status:** Accepted
- **Date:** 2026-11-05
- **Decision owner:** Project Owner

## Context
Ledger correctness cannot depend only on NestJS application code. Database clients, maintenance scripts and future workers must not be able to create unbalanced or mutable financial history.

## Decision
Journal creation is controlled through separate database functions for draft creation, draft-entry addition and posting. The controlled `post_journal()` operation validates at least two entries, valid accounts, valid account/currency relationships, positive amounts, and debit-credit equality independently for each currency. Posting is atomic and cannot be repeated.

The application runtime role does not own ledger tables and does not receive unrestricted `UPDATE` or `DELETE` privileges. Privileged functions use a fixed safe `search_path` and restricted `EXECUTE` grants. A deferred constraint trigger validates final journal state at transaction commit. Append-only triggers reject changes to posted journals and entries.

Posted entries are authoritative. Synchronous balance projections are updated in the same posting transaction but can be reconstructed from posted entries. Available balance is the authoritative posted ledger balance minus active holds; account and hold rows are locked in deterministic order during spending operations.

Every currency balances independently. FX transactions use linked currency-specific journals and explicit accounts for fees, spreads, rounding and FX gain/loss. Customer sub-ledgers reconcile to currency-specific Customer Deposits control accounts.

Corrections use reversal or authorized adjustment journals. Posted rows are never edited or deleted.

## Alternatives considered
- Application-only validation — rejected because direct database access could bypass the invariant.
- Trigger-only design — rejected because the posting workflow and permissions would remain implicit.
- One base-currency journal for all currencies — rejected because it hides currency imbalance and FX accounting.
- Mutable balance as the source of truth — rejected because it cannot independently prove financial history.

## Trade-offs
The design introduces PostgreSQL-specific functions, roles and triggers. This adds migration and integration-test work, but creates a strong boundary around the most important financial invariant.

## Consequences
Database roles, function ownership, `search_path`, execute privileges and trigger behavior must be tested. Reconstruction and mismatch repair require controlled operational procedures. This ADR records an accepted architecture decision; no implementation or verification is implied.
