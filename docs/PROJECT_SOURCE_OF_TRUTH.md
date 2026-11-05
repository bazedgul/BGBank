# BG Bank Project Source of Truth

- **Approval date:** 2026-11-05
- **Decision owner:** Project Owner

This document summarizes the current approved architecture direction. Individual ADRs remain authoritative for their decisions. Acceptance means the design is approved; it does not mean application code, migrations, dependencies or verification have been completed.

## Repository reality

The repository currently contains documentation and placeholder directories only. No backend or frontend implementation, dependency manifest, migration, test suite or CI workflow has been created.

## Accepted decisions

- One double-entry ledger with customer sub-ledgers under currency-specific Customer Deposits control accounts (ADR-0002).
- Atomic financial idempotency and recovery (ADR-0004).
- Opaque PostgreSQL-backed browser sessions with secure cookies and CSRF protection (ADR-0005).
- Controlled PostgreSQL ledger functions, deferred integrity validation, append-only protection and independent per-currency balancing (ADR-0006).

## Proposed decisions

- Technology direction remains Proposed in ADR-0001: NestJS, PostgreSQL, Drizzle, PostgreSQL outbox worker initially, React/Vite, REST/OpenAPI, separate package roots and UUIDs.
- Money representation remains Proposed in ADR-0003: `BIGINT` minor units, explicit currency, `Money` value object and explicit FX rounding.

## Product priority versus delivery phase

P0 describes product importance; it does not mean the capability is delivered in Phase 1.

## Phase 1 scope

Phase 1 is ordinary same-currency internal transfers using immediate atomic posting: `created → posted → completed`, with full reversals, atomic idempotency, synchronous balance projection updates in the posting transaction, deterministic account locks and the ledger invariants documented in `DATABASE_DESIGN.md`. Ledger entries remain authoritative and projections are rebuildable. Risk review, maker-checker approval, the full hold lifecycle and external payment pending flows are designed for extension but not yet implemented.

## Deferred decisions

- Partial reversals
- External payment rails and provider timeout handling
- Full hold lifecycle implementation (create, capture, release, expiry)
- Redis/BullMQ adoption
- Exact session schema and rate limits
- Exact chart-of-accounts codes
- Exact Drizzle migration conventions
- Backend test runner choice

## Unresolved risks

- No implementation has yet verified the accepted database function, trigger and permission design.
- Runtime role separation and safe `search_path` must be tested in PostgreSQL integration tests.
- Synchronous balance projections need repair and mismatch alerting procedures.
- Browser session recovery and risk-challenge thresholds need detailed product rules.
- The repository still lacks implementation manifests, lockfiles, CI and dependency scanning.
