# Backend Standards

Stack is decided in `adr/0001-technology-stack.md` (recommended: NestJS + TypeScript + PostgreSQL). These standards are stack-agnostic; examples use NestJS-style names. If the repo uses Django/other, map equivalently (views→controllers, serializers→DTO validation).

## Module structure (per domain)
```
backend/src/modules/<domain>/
  api/            controllers/routes, request/response DTOs, validation
  application/    use-case services (orchestration, transactions)
  domain/         entities, value objects, rules, state machines, errors
  infrastructure/ data access, provider adapters, mappers
  events/         domain events published / handled
  <domain>.module.ts
  __tests__/
```
Shared code lives in `backend/src/shared/` (money, errors, logging, config, idempotency, auth guards). Keep `shared` small.

## Layer rules
- **Controllers are thin:** authenticate, authorize, validate, call one application service, map the response.
- **Application services** own transactions and orchestration. **Domain** holds rules and state machines. **Infrastructure** talks to DB/providers.
- No banking logic in controllers, DTOs/serializers, ORM entities or frontend.
- Business logic must not be duplicated between endpoints — put it in a service.
- Add a repository/abstraction **only** when it removes real pain (testing, multiple implementations). Don't wrap the ORM reflexively.
- Cross-module calls go through the other module's **public service**; never import its internals or touch its tables.
- No circular dependencies (enforce with lint rule/`madge`).
- Files: one clear responsibility each; soft cap ~300 lines. No god services.

## Money
- Store as integer **minor units** (`BIGINT`) + `currency` (ISO 4217) — or `NUMERIC(20,4)` if ADR chooses so. Never float/double. FX rates `NUMERIC(18,8)`.
- Use a `Money` value object: no arithmetic across currencies, explicit rounding mode (documented, e.g. banker's rounding), currency exponent table.
- Rounding happens at defined points (quote, fee) and is tested.

## Database (see `DATABASE_DESIGN.md`)
Meaningful names, FKs, CHECK/UNIQUE constraints, indexes driven by real queries, migrations only (never hand-edit prod), no N+1, transactions for every financial write, explicit isolation/locking.

## Concurrency
- Lock the **rows** that matter with `SELECT … FOR UPDATE`, in **deterministic order** (by account id) to avoid deadlocks; or use optimistic versioning with retry — choose per use case and document.
- Keep transactions short; no network calls to providers inside a DB transaction.
- Unique constraints are the last line of defence (idempotency keys, one active hold per reference, etc.).

## Idempotency
`Idempotency-Key` header on financial writes. Store `(scope, key, request_hash, response, status)`. Same key + same hash → return stored response. Same key + different hash → `409`. In-progress duplicate → `409/425` or wait. Keys expire per policy.

## State machines
Each state machine is a pure domain object with an allowed-transition table; illegal transition → domain error; every transition is persisted with actor, reason and timestamp.

## Events & outbox
Write outbox row in the **same** DB transaction as the state change. A worker publishes at-least-once; consumers are **idempotent**.

## Providers/adapters
Adapters translate provider specifics into the port's contract. Timeouts → `UNKNOWN`, never `FAILED`. Use timeouts, bounded retries with backoff+jitter (only for safe/idempotent calls), circuit breakers.

## Errors & logging
Typed domain errors → consistent HTTP error body `{ code, message, details?, requestId }`. Never leak internals. Structured JSON logs with `requestId`; never log secrets, full PAN, OTPs or tokens. Don't swallow exceptions.

## API conventions
REST, correct verbs/status codes, consistent envelope, pagination + filtering, versioning (`/v1`), OpenAPI docs kept in sync, authN/Z on every endpoint, object-level checks, rate limits on sensitive routes.

## Configuration
Env-based, validated at startup (fail fast), no hardcoded values, constants for magic numbers, region rules in config/DB.

## Testing
Test pyramid: unit (domain/state machines/money) → integration (DB, real Postgres) → API tests → e2e for critical flows.
**Mandatory banking cases:** success · insufficient funds · duplicate request (idempotency) · **concurrent transfers** · invalid account state · reversal · limit violation · authorization failure (object-level) · provider timeout · unknown outcome → reconciliation · mismatch handling · decimal precision/rounding · rollback on failure.
**Invariant/property tests:** every journal debits = credits; trial balance = 0; sum(customer sub-ledgers) = control account; no negative available balance (unless overdraft allowed); ledger entries never mutate.
Never weaken/delete tests to get green.

## Definition of done
Code + tests passing · migrations reviewed · docs updated · security checklist · report with "how it works" written · PR opened (not merged without approval).
