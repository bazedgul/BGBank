# ADR 0004: Financial idempotency and recovery

- **Status:** Accepted
- **Date:** 2026-11-05
- **Decision owner:** Project Owner

## Context
Financial clients retry requests when a network response is delayed or lost. A retry must not create a second transfer, journal, debit, or credit. The system also needs deterministic replay for business failures.

## Decision
Financial writes use a client-supplied idempotency key scoped to the authenticated principal and operation. The database enforces `UNIQUE(scope, key)`. The request is validated and canonically normalized before hashing.

The idempotency record, transfer, journal, entries, transfer state history, audit event, outbox event, and final response status/body/resource reference are committed in one database transaction.

The initial internal-transfer flow does not persist a separate durable `processing` state. An uncommitted transaction is invisible to other transactions; the unique constraint and row locks serialize competing requests. A committed business rejection is stored and replayed using the same retention policy as a successful operation.

Same key plus the same request hash returns the stored result. Same key plus a different hash returns `409 Conflict`. If the transaction rolls back, no financial or idempotency outcome remains and the client retries with the same key. If the transaction commits but the HTTP response is lost, the retry returns the stored committed result.

## Alternatives considered
- Separate idempotency and financial transactions — rejected because a crash between them can permit duplicate execution.
- Raw JSON hashing — rejected because equivalent requests can differ in whitespace or key order.
- Application-only uniqueness checks — rejected because concurrent requests require a database constraint.
- Durable `processing` rows for the initial synchronous transfer — deferred; unnecessary while the complete operation is one short transaction.

## Trade-offs
The transaction is slightly larger and response bodies must be safely serializable. In return, the database provides one durable decision point and safe recovery after uncertain HTTP outcomes.

## Consequences
Financial writes require idempotency keys. Retention, cleanup, payload-size limits and future asynchronous workflows remain implementation details. This ADR records an accepted architecture decision; no implementation or verification is implied.
