# BG Bank — Phase D Proposal

**Status:** Proposal only — not approved for implementation
**Decision owner:** Project Owner
**Prepared:** 2026-11-06

## 1. Objective and rationale

Phase D should turn the verified Phase A–C database foundation into the first complete, testable application vertical slice: an authenticated customer can view their own account and transaction data and perform a same-currency internal transfer in the local sandbox.

This is the most useful next increment because the repository currently has no banking domain modules or business endpoints. The database already has the strongest foundation needed for a transfer—accounts, ownership, ledger accounts, journals, journal entries, synchronous balance projections, audit events, and controlled PostgreSQL functions—but it lacks the business transfer record, idempotency boundary, application services, authorization context, and API surface that connect those safeguards to a user workflow.

This proposal deliberately does not expand into external rails, real payments, KYC providers, FX, fraud scoring, or a broad administrative portal.

## 2. Verified starting point

Repository inspection and Graphify navigation verified the following:

- `backend/src/database/schema/index.ts` defines `users`, `customers`, `currencies`, `accounts`, `account_owners`, `ledger_accounts`, `journals`, `journal_entries`, `journal_status_history`, `account_balance_projections`, `audit_events`, and `outbox_events`.
- Migrations `0000`–`0008` establish the relational foundation, controlled ledger functions, role separation, hierarchy protection, synchronous projections, ownership hardening, lifecycle functions, reversal protection, and projection repair.
- Account lifecycle functions enforce permitted transitions, one primary owner for activation, customer sub-ledger linkage, one-year dormancy activity rules, and authoritative zero balance before closure. Status changes create audit events.
- Ledger functions enforce controlled draft creation/posting, positive entries, valid posting accounts, per-currency balancing, append-only posted records, and full journal reversal rules.
- The runtime application currently contains only `DatabaseModule`, `HealthModule`, environment validation, and one health-service test. There are no transfer, identity, account-query, statement, or authorization modules.
- The current schema does not contain the transfer, transfer-history, idempotency, session, credential, KYC, hold, beneficiary, or limit tables described as future design areas.
- Existing tests are unit-level health tests. PostgreSQL integration coverage for permissions, functions, triggers, and concurrency is still required before financial endpoints are considered production-quality—even for this sandbox.

The existing Graphify code-only graph was queried before source inspection. It reports 165 nodes and 216 relationships and identifies the schema entities and database service as the main connected area. SQL migrations contribute little to the graph because the installed Graphify environment lacks `tree_sitter_sql`; the migration files remain the authoritative source for database behavior.

## 3. Recommended scope

### Included

1. **Authentication and authorization seam** sufficient for the vertical slice:
   - establish the approved opaque, server-side session model;
   - authenticate a simulated local customer and derive the actor/customer identity from the session, never from a caller-supplied customer ID;
   - enforce object-level ownership checks in application services;
   - add a separate admin/operations authorization seam only where needed for test fixtures or existing lifecycle operations.
2. **Customer account read APIs** for owned accounts and their authoritative projected balances.
3. **Same-currency internal transfers** between eligible owned/customer accounts, using immediate atomic posting.
4. **Idempotency and transfer state history** for every financial write.
5. **Read-only transaction history** backed by posted journals and entries, scoped to accounts the session may access.
6. **Transactional audit and outbox records** for transfer state changes and financial outcomes.
7. **PostgreSQL integration tests** proving the role, function, trigger, authorization, rollback, idempotency, and concurrency boundaries.

### Explicitly excluded

- Real payment rails, provider connections, external money movement, webhooks, or live financial data.
- FX, cross-currency transfers, remittance, quotes, fees, or second-region adapters.
- Full KYC document workflows or real KYC providers. A simulated customer fixture may be used for tests, but it is not a compliance implementation.
- Beneficiary management, limits, velocity rules, fraud detection, AML, cards, bills, holds, and pending external payments.
- Maker-checker workflows for new business actions unless the owner separately approves an administrative action in this phase. The existing account lifecycle security boundary remains intact.
- Statement PDFs/CSVs, notifications, frontend work, background workers, Redis/BullMQ, and AI features.
- Direct ORM writes to ledger tables that bypass approved PostgreSQL functions.

The exclusions are important: holds, limits, beneficiaries, fraud, and external payment states have dependencies that should be designed as complete features rather than partially implied by an internal transfer endpoint.

## 4. User stories and workflows

### Customer reads accounts and balances

As an authenticated simulated customer, I can list my owned accounts and see currency, lifecycle status, and current ledger/available projections. The service resolves ownership from the authenticated customer and never trusts a customer identifier in the request.

Flow:

1. Validate the session and load the principal.
2. Resolve account ownership through `account_owners`.
3. Join the account's currency and `account_balance_projections` row.
4. Return a minimal representation with masked account number data.
5. Record an audit event only if the approved privacy policy requires read auditing; do not create noisy financial audit records for every ordinary read by default.

### Customer views transaction history

As an authenticated customer, I can paginate posted activity for an account I own. The result is derived from posted journals and entries, with deterministic ordering and no exposure of unrelated ledger accounts or internal control-account details.

### Customer sends an internal transfer

As an authenticated customer, I can send a positive amount in the source account's currency to another eligible sandbox customer account.

Flow:

1. Validate request fields and the `Idempotency-Key` header.
2. Canonicalize the request and hash it.
3. Claim or replay the scoped idempotency record.
4. Resolve and authorize the source account from session ownership; validate the destination and same currency.
5. Lock both account rows in deterministic ID order.
6. Confirm both accounts are eligible, the source is not frozen/dormant/closed, and available funds are sufficient.
7. Create the transfer business record and state history.
8. Create and post the balanced journal through the approved database function, updating projections atomically.
9. Write audit and outbox rows in the same transaction.
10. Store the final response against the idempotency key and return it.

The planning default is one exact full reversal represented by a separate transfer and separate reversal journal, leaving the original transfer completed and its posted journal immutable. This remains subject to D0 technical verification, final API/product confirmation, and explicit implementation approval.

## 5. Proposed database changes

All changes must be forward-only Drizzle SQL migrations. No historical migration may be edited, and `drizzle-kit push` must not be used.

| Proposed structure | Reuse from Phase A–C | Proposal |
|---|---|---|
| `transfers` | Reuse `accounts`, currency FKs, account ownership, projections, journals, and audit/outbox conventions. | Add source/destination accounts, amount/currency, state, journal reference, request/actor references, timestamps, and optional reversal reference. Add checks for positive amount, distinct accounts, same-currency relationships, valid state/journal combinations, and at most one full reversal. |
| `transfer_state_history` | Reuse the shape and actor/request conventions of `journal_status_history` and `audit_events`. | Append every transfer transition with actor, reason, request ID, and timestamp. |
| `idempotency_keys` | Reuse transaction boundaries and request ID conventions; no existing table currently provides this. | Add scoped key, canonical request hash, processing/terminal state, response or resource reference, timestamps, and a unique `(scope, key)` constraint. Define retention/tombstone policy before implementation. |
| Authentication identities/sessions | Reuse `users` as the principal anchor, but no credential/session structure exists. | Add only after the owner approves the exact ADR-0005 schema: password/OTP identity representation, hashed opaque sessions, device metadata, expiry, revocation, and CSRF strategy. Never store raw session tokens. |
| Optional transfer-specific outbox payload | Reuse existing `outbox_events`. | No new outbox table. Define event type and payload versioning; keep the event in the same transaction as the transfer outcome. |

The transfer and idempotency tables are required for the recommended scope. Authentication/session schema is a prerequisite decision, not permission to invent a schema during implementation.

Database functions should own the financial mutation boundary. If application orchestration requires a new function, it must preserve the existing role model, secure `search_path`, actor validation, controlled journal posting, append-only triggers, and per-currency balancing.

## 6. Backend modules and API proposal

Use the existing NestJS modular structure and thin-controller/application-service/domain-rule pattern.

### Proposed modules

- `identity`: session authentication, principal loading, logout/revocation, and CSRF/origin checks.
- `authorization`: reusable customer ownership and role policy checks. It must be a policy boundary, not a second source of account state.
- `accounts`: owned-account queries and balance projection reads.
- `transfers`: request validation, canonical hashing, state machine, orchestration, idempotency, and transfer history.
- `transactions`: read-only posted journal history and pagination.
- `audit`: typed audit event writing through the approved persistence boundary.
- `outbox`: event contract and later worker seam; Phase D need not introduce a broker or external delivery.

### Candidate versioned endpoints

These are design candidates, not an approved API contract:

- `GET /api/v1/me`
- `POST /api/v1/auth/session`
- `DELETE /api/v1/auth/session`
- `GET /api/v1/me/accounts`
- `GET /api/v1/me/accounts/:accountId/transactions?cursor=&limit=&from=&to=`
- `POST /api/v1/transfers` with mandatory `Idempotency-Key`
- `GET /api/v1/transfers/:transferId`

Responses must use a consistent `{ data, requestId }` or equivalent project-wide envelope, typed error codes, cursor pagination, and minimal fields. Account and transfer resource access must be re-authorized in the service layer on every request.

The existing `backend/src/main.ts` sets the global Nest prefix to `api/v1`. No banking controller currently exists, so these are proposed routes under the verified prefix rather than existing API behavior.

### Authentication decisions for Phase D

These decisions apply the accepted ADR-0005 architecture to a local, simulated customer bootstrap. They do not create real customer onboarding or KYC.

- **Bootstrap:** development/test-only seed or explicit local bootstrap command creates a simulated user/customer/account fixture. It must be disabled when `NODE_ENV=production`, must not accept arbitrary privilege or account ownership from a public request, and must use non-secret fixture credentials supplied through the test harness or local operator workflow. A production-like runtime has no self-service bootstrap endpoint.
- **Credentials:** store a separate credential record keyed to `users.id`, with an Argon2id password hash, algorithm parameters/version, timestamps, failed-attempt counters, lockout state, and password-change metadata. Never store plaintext passwords, reversible encryption, or password-equivalent values. OTP/TOTP secrets and recovery codes require separate hashed/encrypted handling and are outside the first customer transfer slice unless approved.
- **Sessions:** store only a hash of a cryptographically random opaque token, tied to user, session class (`customer`/`admin`), device metadata, created/last-seen/expiry/revoked timestamps, and a token-generation or replacement marker. The browser receives the raw token only in an `HttpOnly`, `Secure` cookie. Browser JWT access/refresh tokens are excluded.
- **Lifecycle:** customer sessions use the ADR-0005 recommended 30-minute idle and 7-day absolute limits; admin sessions use 15-minute idle and 8-hour absolute limits. These are configurable values, not hardcoded business logic. Rotate after login and privilege elevation; revoke on logout, logout-all, password change, recovery, suspicious token reuse, and relevant security changes; clear the cookie on logout. Sliding idle expiry must never extend the absolute expiry.
- **CSRF and origin:** cookie-authenticated state changes require CSRF validation, configured SameSite behavior, strict origin validation, and configured CORS. Login, logout, and transfer endpoints need explicit tests.
- **Boundaries:** customer sessions can read and mutate only resources authorized through the current customer's `account_owners` rows. Admin/operations roles are separate principals/policies and are not implied by a customer role. This phase does not expose admin lifecycle mutation endpoints. Existing lifecycle SQL functions require an active human actor, but the repository does not yet contain an application admin role model; that gap must not be hidden behind a customer endpoint.

### Proposed response and error contract

Success responses use `{ "data": <payload>, "requestId": "<request-id>" }`. Errors use `{ "error": { "code": "<stable-code>", "message": "safe-message", "details": {} }, "requestId": "<request-id>" }`; details never contain SQL errors, credentials, tokens, or internal stack traces.

Minimum stable codes are:

- `AUTHENTICATION_REQUIRED` (401), `AUTHENTICATION_FAILED` (401), `SESSION_REVOKED` (401), `CSRF_FAILED` (403)
- `FORBIDDEN` (403), `RESOURCE_NOT_FOUND` (404; use deliberately to avoid object enumeration)
- `VALIDATION_FAILED` (400), `INVALID_CURSOR` (400), `IDEMPOTENCY_KEY_REQUIRED` (400)
- `IDEMPOTENCY_CONFLICT` (409), `TRANSFER_IN_PROGRESS` (409 or approved wait behavior)
- `ACCOUNT_NOT_ELIGIBLE` (409), `INSUFFICIENT_FUNDS` (422), `CURRENCY_MISMATCH` (422), `SELF_TRANSFER` (422)
- `CONFLICT` (409), `DEPENDENCY_UNAVAILABLE` (503), `INTERNAL_ERROR` (500)

`POST /api/v1/transfers` accepts `{ "sourceAccountId": "uuid", "destinationAccountId": "uuid", "amountMinor": "integer-string-or-safe-integer", "currency": "ISO-4217-code", "reference": "optional bounded text" }`. The server derives the actor and source ownership from the session, validates destination visibility/eligibility, and treats the request hash as a canonical representation of normalized fields—not raw JSON formatting.

The successful transfer response contains a public transfer ID, state, source/destination account references safe for that customer, amount/currency, journal timestamp, and request ID. It does not expose journal-entry internals or unrelated ledger accounts.

## 7. Authorization and security requirements

- Use opaque, random, server-side sessions with only token hashes persisted. Apply the approved idle/absolute timeouts, rotation, revocation, device listing, and logout-all behavior from the security standards.
- Use `HttpOnly`, `Secure`, deliberate `SameSite`, strict origin validation, and CSRF protection for cookie-authenticated state changes.
- Deny by default. A customer can access only accounts reachable through their current `account_owners` relationship. Never accept `customerId` or actor identity as authority from the client.
- Validate amount, currency, account IDs, pagination, dates, and reason/reference lengths at the boundary. Use integer minor units only.
- Do not expose internal ledger account IDs, control-account balances, database errors, session material, tokens, or credential data.
- Keep runtime database access aligned with `bg_bank_app`/runtime restrictions. Ledger writes must use the controlled posting functions and approved grants; no new broad table grants.
- Rate-limit session creation, failed authentication, and transfer attempts. Exact limits require owner approval or a separate risk decision.
- Add audit events for authentication security events, transfer creation/state transitions, authorization failures where policy requires them, and idempotency conflicts. Never log passwords, OTPs, session tokens, or full sensitive identifiers.
- Do not introduce real KYC, provider, payment, or customer data integrations.

## 8. Integrity, concurrency, and failure handling

- The transfer state machine should initially be `created → posted → completed` or terminal `rejected`, matching the approved Phase 1 design. No pending/external states should be added without a separate design.
- Claim idempotency before financial work. Same scope/key plus the same canonical hash replays the committed result; a different hash returns `409`; an in-progress duplicate follows the approved wait/conflict policy.
- Lock source and destination accounts in deterministic ID order. Keep the transaction short and perform no network calls inside it.
- Reject self-transfers, currency mismatches, inactive or ineligible accounts, insufficient available balance, invalid ownership, and repeated reversal attempts.
- Commit the business transfer, journal posting, projection update, state history, audit event, outbox event, and terminal idempotency result atomically. Unexpected failures roll back and must not leave a replayable successful outcome.
- Treat a database timeout as an indeterminate client outcome until the idempotency record is checked; never blindly submit the transfer again.
- Read transaction history from authoritative posted journal data with stable cursor ordering. Projections are for balance reads and remain rebuildable diagnostics.
- Preserve append-only ledger behavior. Corrections use reversal records/functions, never mutation of posted entries.

### Verified Phase B posting boundary and required gaps

The migrations currently define `create_draft_journal`, `add_draft_journal_entry`, `validate_posted_journal`, `post_journal`, and `reverse_journal` as `SECURITY DEFINER` functions with `search_path = pg_catalog, public`. Posted journal/entry mutation triggers, a deferred balance trigger, per-currency balancing, actor-shape checks, and controlled ownership/grants are present in the SQL migrations. `post_journal` updates `journals`, writes journal status history, and updates account projections in one database transaction. `bg_bank_runtime` can create draft journals and entries; `bg_bank_posting` can post and reverse; public execute is revoked. The application must not assume these controls are verified merely because the SQL exists: no PostgreSQL integration test currently proves them.

The current safeguards do not by themselves provide a transfer-level atomic operation. They also do not enforce transfer-specific source/destination ownership, same-currency transfer relationships, idempotency uniqueness, transfer-state/journal consistency, one reversal per transfer, or a transfer-aware sufficient-funds check. Those are required new safeguards. Before implementation, also verify the security-definer functions' ownership, grants, `search_path`, actor identity binding, actual runtime connection identity, role membership, and whether the runtime connection can reach the intended posting role without broadening grants.

D0 must explicitly investigate whether the current `reverse_journal()` implementation updates `account_balance_projections`. The migration body creates the opposite posted journal and entries, but the repository review has not established that it updates projections. Any ledger/projection inconsistency is a Phase D blocker and requires a separately reviewed forward-only correction; this proposal authorizes no migration change.

### Exact financial transaction boundary

The transfer application service must use one database transaction for idempotency claim/read, source and destination account locks, authorization-relevant account state reads, balance/hold check (currently no holds), transfer row creation, draft journal creation and entries, posting, transfer state history, audit event, outbox event, and terminal idempotency result. Lock accounts in sorted UUID order before checking funds. Do not call providers or other networks inside the transaction. A domain or database error rolls back every row written in that transaction; the client retries by idempotency key and reads the committed result rather than blindly submitting again.

The application should invoke the approved functions through the permitted posting boundary rather than issuing direct inserts/updates to ledger tables. If a single transfer-specific SQL function is required to make role switching and lock ordering enforceable, it must be introduced as a reviewed forward-only migration and preserve the existing least-privilege role design.

### Missing safeguards to add or explicitly verify

- Transfer-table checks/FKs and a unique partial index for one full reversal.
- Database-enforced transfer-to-journal relationship and valid state/journal combinations.
- Idempotency `(scope, key)` uniqueness and request-hash conflict behavior.
- A server/database check that the source account is owned by the authenticated customer; destination eligibility must not rely solely on application code.
- A consistent sufficient-funds check under the same account locks as posting. The current projection invariant equates available and ledger balance because holds do not exist.
- Actor binding: the authenticated session's user ID must be the human actor passed to ledger/audit functions; clients cannot supply it.
- PostgreSQL integration verification for grants, function execution, immutable triggers, deferred constraints, and rollback.

## 9. Testing strategy and acceptance criteria

### Unit tests

- Transfer state transition table, canonical request hashing, money/currency validation, error mapping, and authorization policies.
- Session expiry/revocation and CSRF/origin policy behavior.
- Cursor validation and transaction-history response shaping.

### PostgreSQL integration tests

Against an isolated local PostgreSQL test database created solely for tests, with a disposable test schema/database and fixture data loaded through reviewed migrations/fixtures. Tests must not use the development database, production credentials, `.env` values, live customer data, or a privileged superuser for application behavior. The harness should connect separately as the runtime/app, posting, readonly/reconciliation, and test/setup roles as appropriate; setup may use a controlled owner/migrator connection, while assertions prove the application role cannot perform owner-only operations. The current repository has no such harness, so this is a prerequisite rather than an existing capability.

Required scenarios:

- Account ownership and object-level authorization.
- Successful same-currency transfer and exact projection changes.
- Journal debit/credit equality and immutable posted records.
- Insufficient funds, invalid status, self-transfer, currency mismatch, and closed/frozen/dormant account rejection.
- Same idempotency key/same hash replay; same key/different hash conflict; concurrent duplicate requests.
- Concurrent transfers from one account, including deterministic locking and no negative available balance.
- Rollback when audit, outbox, posting, or idempotency finalization fails.
- Reversal policy and one-reversal-only enforcement after owner approval.
- Runtime role cannot bypass ledger functions or mutate protected records.
- Session/customer isolation and absence of sensitive values in responses/logs.

Concurrency tests must use independent connections and synchronization barriers, not sequential calls pretending to be concurrent. At minimum, run two transfers concurrently from one source and two identical requests concurrently with one idempotency key. Assert one correct financial outcome, no negative available balance, one committed idempotency outcome, and no orphaned draft/transfer rows.

Rollback tests must force failures after draft creation, after posting attempt, and before idempotency finalization where possible. Assert that the transaction leaves no successful transfer, no posted journal, no projection change, no audit/outbox success record, and no terminal idempotency response unless the approved crash-recovery design explicitly records an in-progress tombstone.

### API tests

- Authenticated and unauthenticated access.
- Object-level authorization across two customers.
- Validation and typed error envelopes.
- Mandatory idempotency header and replay behavior.
- Pagination boundaries and stable ordering.

### Acceptance criteria

Phase D is ready for owner review only when:

1. The owner has approved the session schema, transfer reversal policy, idempotency retention policy, and API contract.
2. All schema changes are forward-only reviewed migrations and no database reset or `drizzle-kit push` was used.
3. Every financial write uses the approved idempotent transaction boundary and controlled posting functions.
4. Customer object-level authorization is enforced and covered by negative tests.
5. The mandatory concurrency, rollback, immutability, role-boundary, and balance invariants pass against PostgreSQL.
6. Typecheck, lint, unit tests, integration/API tests, build, and format checks pass.
7. OpenAPI/API documentation, security review notes, learning log, and implementation report are updated.
8. No real providers, payment rails, credentials, customer data, or external money movement are introduced.

## 10. Dependencies, risks, and implementation order

### Dependencies

1. Owner decisions on exact session schema and authentication bootstrap.
2. Owner decision on full reversal exposure and idempotency retention/tombstones.
3. A safe isolated PostgreSQL integration-test harness using the existing restricted-role model.
4. Confirmation that the current migration role and runtime role assumptions can be exercised locally without changing credentials or ACLs.

### Risks

- The source-of-truth documents say accepted database enforcement is not yet fully verified; integration tests are a release gate, not optional cleanup.
- The current runtime reads one `DATABASE_URL`; role selection and secure connection configuration need to be made explicit without weakening least privilege.
- Session/authentication design is security-sensitive and currently listed as unresolved.
- The existing `available_balance_minor = ledger_balance_minor` invariant is correct for the current no-holds foundation but must not be silently reused once holds are introduced.
- Ledger and migration SQL are not fully represented by the current Graphify AST graph because SQL parsing support is missing.
- A transfer API can become a broad payment platform if external/pending behavior is added prematurely; the state machine must remain internal and immediate.

### Proposed implementation order after approval

1. Resolve ADR-0005/session, reversal, idempotency-retention, and API-contract decisions.
2. Build isolated PostgreSQL integration-test fixtures and verify existing Phase A–C functions/roles before adding behavior.
3. Add forward-only transfer, transfer-history, and idempotency migrations plus schema declarations and database backstops.
4. Implement identity/session and authorization seams.
5. Implement account and transaction read services/controllers.
6. Implement transfer state machine, idempotent orchestration, audit/outbox integration, and controlled posting calls.
7. Add unit, integration, API, concurrency, security, and rollback tests.
8. Run all project checks, update Graphify for changed code, review security and documentation, and stop for owner review.

## 11. Estimated milestones

Estimates are relative engineering milestones, not a commitment to a schedule.

| Milestone | Outcome |
|---|---|
| D0 — decisions and test harness | Approved decisions recorded; isolated PostgreSQL role/invariant tests characterize the existing foundation. |
| D1 — transfer persistence | Forward-only transfer/history/idempotency schema and database constraints/functions reviewed. |
| D2 — identity and reads | Session principal, object authorization, account balances, and transaction-history APIs tested. |
| D3 — transfer vertical slice | Atomic same-currency transfer, idempotency, audit, outbox, and error handling complete. |
| D4 — hardening | Concurrency/rollback/security tests, API documentation, Graphify update, full checks, and owner-review package complete. |

Each milestone should remain independently reviewable; no milestone authorizes implementation of the next one without owner approval for schema or security-sensitive changes.

## 12. Deliberately deferred capabilities

Defer full holds and available-balance divergence, limits, beneficiaries, fraud and AML, maker-checker workflows for new domains, statements/export, notifications and workers, simulated external rails, orchestration/circuit breakers, FX, remittance, reconciliation against external statements, cards, bills, AI tools, and frontend application work.

These capabilities should follow the product sequence only after the internal-transfer vertical slice is verified. In particular, Phase E-style risk and payment features should build on an explicit hold/limit/provider state model rather than adding columns or statuses opportunistically.

## 13. Resolved Phase D design decisions

### Idempotency

- **Canonical hash:** normalize JSON into a fixed object containing only approved semantic fields; sort object keys recursively; reject unknown fields; normalize UUIDs and ISO currency case; represent `amountMinor` as a decimal integer string; normalize optional reference according to the API rule; serialize with no insignificant whitespace; hash with SHA-256. The hash includes an operation/version marker so future contract changes cannot silently reuse old semantics.
- **Scope and uniqueness:** scope is `customer:<authenticated-user-id>:transfers:create:v1` (or the equivalent stable principal/operation scope). The database enforces unique `(scope, key)`; keys are bounded, non-empty, and never accepted from a customer ID supplied in the body.
- **Simultaneous duplicates:** the first transaction claims the key and owns the request hash. A same-hash concurrent request waits only according to an explicit bounded policy, then reads the committed result; it never executes a second transfer. A different hash returns `IDEMPOTENCY_CONFLICT` (409) and never mutates financial state. If a processing row is visible after the bounded wait, return `TRANSFER_IN_PROGRESS` (409) and require the client to retry the same key.
- **Crash recovery:** all business effects and the terminal idempotency outcome commit together. A transaction rollback leaves no terminal success. A process/database failure after commit but before the HTTP response is recovered by replaying the key. A stale `processing` row is not automatically reused until a lease/ownership policy is approved and safely reconciled; no blind retry is permitted.
- **Retention/tombstone:** retain terminal outcomes for the maximum client retry/replay-risk period plus an owner-approved safety margin. After response-body retention, retain a tombstone containing scope, key, request hash, terminal status/resource identity, and expiry barrier so a late retry cannot execute again. Cleanup is an authorized maintenance operation and cannot remove a tombstone before the approved replay-risk window.

### Transfer state machine

The durable state machine is intentionally minimal:

```text
created --successful post--> posted --successful finalization--> completed
   \--deterministic validation/business failure------------------> rejected
```

- `created` persists only inside the financial transaction and is visible after commit only if the design deliberately supports a durable rejected record; for an immediate transfer, a successful request must not commit a long-lived `created` state.
- `posted` is written only after the journal has successfully posted and projections have updated, within the same transaction. It is an internal durable milestone for audit/state history, not an externally pending payment state.
- `completed` is the terminal successful transfer state and commits in the same transaction as the posted journal, audit, outbox, and idempotency response. There is no externally observable gap between posted and completed in this phase.
- `rejected` is terminal for deterministic business failures that the product chooses to retain for audit. It has no journal and no projection mutation. Unexpected errors roll back rather than becoming `rejected`.
- No `processing`, `pending`, `settled`, or provider states are introduced; those belong to external-payment phases.

### Reversals

A reversal is a separate transfer row linked by `reversalOfTransferId` to the original completed transfer and a separate reversal journal linked by `reversesJournalId` to the original journal. It swaps source and destination, copies the original amount and currency exactly, and creates the exact opposite multiset of journal entries. The original transfer and original posted journal remain completed and immutable. A unique partial index on the reversal reference plus a database/function check enforces at most one full reversal. Reversal creation uses the approved `reverse_journal` behavior or a reviewed transfer-aware wrapper, with its own idempotency key and audit/outbox records. Partial reversals remain out of scope.

### Ledger posting and permissions

The verified grants show that runtime can create drafts, while posting and reversal execute through the posting role; public execute is revoked. This must be tested rather than assumed. The transfer service must not call `post_journal` through an unapproved elevated credential or pass an arbitrary actor. The authenticated user's verified ID is the human actor; system actor references are reserved for explicitly approved system workflows. No new ACL, ownership, or runtime privilege is authorized by this proposal.

## 14. Owner Decisions and Approval Checklist

### Approved for planning

The project owner has selected these defaults for planning only. They are not implementation approval and do not authorize unrestricted implementation, schema changes, database access, migration execution, or permission changes:

1. **Planning default only:** Phase D is the authenticated customer internal-transfer vertical slice.
2. **Planning default only:** Local simulated customer authentication uses Argon2id password hashing.
3. **Planning default only:** OTP/TOTP and MFA are deferred.
4. **Planning default only:** Authentication uses opaque server-side sessions with the ADR-0005 expiry, rotation, revocation, logout, cookie, CSRF, and origin policies.
5. **Planning default only:** Phase D is customer-only; admin lifecycle APIs are deferred.
6. **Planning default only:** A reversal is one exact full reversal represented by a separate transfer and journal; the original completed transfer and posted journal remain immutable, subject to D0 technical verification and final approval.
7. **Planning default only:** Idempotency uses SHA-256 canonical request hashing and scoped uniqueness.
8. **Planning default only:** The planning recommendation is 30-day terminal response retention followed by tombstone protection.
9. **Planning default only:** Transfers process immediately and atomically, with no externally visible pending state.
10. **Planning default only:** The API prefix is `/api/v1`, verified from `backend/src/main.ts`.
11. **Planning default only:** PostgreSQL integration tests use a dedicated disposable PostgreSQL instance/cluster or an explicitly owner-approved isolated instance, with role-separated connections.
12. **Planning default only:** Existing PostgreSQL permissions and role restrictions remain unchanged.

### Still requiring explicit owner confirmation

These details were not fully selected and must be confirmed before implementation:

- Whether local bootstrap is a test/fixture-only seed, a separately protected local operator command, or both. A public bootstrap endpoint remains rejected because it creates an unnecessary privilege and abuse boundary.
- The exact credential/session table columns, password policy, failed-login lockout values, device metadata, and recovery behavior. ADR-0005 defines the architecture, not a complete schema.
- The exact 30-day retention start point, whether deterministic failures and successful outcomes use the same retention, tombstone duration, cleanup cadence, and authorized cleanup role. Shorter retention reduces storage but increases replay and support risk; longer retention costs storage but preserves safer replay barriers.
- Whether same-hash concurrent requests wait for a bounded interval or immediately return `TRANSFER_IN_PROGRESS`; both preserve single execution, but waiting improves client ergonomics while increasing connection occupancy.
- The final API envelope, public resource identifiers, pagination cursor format, rate limits, and exact error-code catalog.
- Whether transfer reversal is customer-initiated or restricted to a later controlled operation. Exposing reversal to customers adds authorization, abuse, and UX requirements.
- The local PostgreSQL test setup mechanism and permitted setup role. It must not use production credentials or change development ACLs/data.

### Must be technically verified before implementation

- Existing migrations' roles, grants, function owners, `SECURITY DEFINER` behavior, and `search_path` under real isolated PostgreSQL connections.
- Runtime draft-creation permissions versus posting-role-only permissions.
- Append-only journal/entry triggers and deferred per-currency balancing behavior, including rollback on failure.
- Whether the application can reach the intended runtime/posting boundary without broadening privileges.
- Existing test isolation and migration execution strategy. The repository currently has Jest unit tests only, no integration database configuration, and no Docker/Compose test harness.
- The proposed transfer-level safeguards: account ownership, transfer-to-journal consistency, idempotency uniqueness, one-reversal maximum, and funds checks under deterministic locks.

### Approval gate

Before any Phase D implementation, the owner must explicitly approve the proposal, confirm the unresolved details above, and approve the D0 plan. D0 itself is limited to documenting and testing the existing foundation; it must not add transfer schema, APIs, credentials, roles, grants, or database data.

Until those approvals and technical gates are complete, Phase D remains documentation-only.
