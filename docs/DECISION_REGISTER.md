# BG Bank Decision Register

- **Approval date for accepted decisions:** 2026-11-05
- **Decision owner:** Project Owner

Accepted means the architecture is approved for future implementation. It does not mean code, migrations or tests exist or have passed.

P0 is product priority, not a promise that every P0 capability is delivered in Phase 1.

| ID | Topic | Decision | Status |
|---|---|---|---|
| ADR-0001 | Technology stack | NestJS/TypeScript, PostgreSQL, Drizzle/Drizzle Kit, PostgreSQL outbox initially, React/Vite, REST/OpenAPI, separate package roots, UUIDs | Proposed |
| ADR-0002 | Ledger model | One double-entry ledger with customer sub-ledgers and chart of accounts | Accepted |
| ADR-0003 | Money | BIGINT minor units with explicit currency, Money value object, explicit FX rounding | Proposed |
| ADR-0004 | Idempotency | Atomic financial operation and final response, canonical hash, unique scoped key, safe retry/replay | Accepted |
| ADR-0005 | Browser authentication | Opaque PostgreSQL-backed sessions, secure cookies, CSRF, OTP/TOTP and revocation | Accepted |
| ADR-0006 | Ledger enforcement | Controlled PostgreSQL functions, deferred validation trigger, restricted roles, append-only records, per-currency balancing | Accepted |

## Deferred Phase 2 or later

- Holds and pending/external payment lifecycle implementation (Phase 2)
- Partial reversals
- External rails, suspense/clearing workflows and reconciliation
- Redis/BullMQ
- Advanced risk review and maker-checker transfer approval

## Remaining implementation questions

- Exact PostgreSQL role names, function signatures and migration ordering
- Exact chart-of-accounts codes and seed data
- Exact session schema, cleanup strategy and challenge thresholds
- Exact Drizzle migration conventions
- Synchronous balance projection schema and repair procedure
- Backend unit-test runner

## Risks

- Accepted ADRs are not yet implemented or verified.
- Database permissions and trigger behavior require integration tests against PostgreSQL.
- Projection mismatch detection needs operational alerting.
- Authentication recovery and rate-limit values require detailed product rules.
