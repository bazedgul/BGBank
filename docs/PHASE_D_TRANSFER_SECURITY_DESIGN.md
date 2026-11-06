# Phase D Transfer Security Design

**Status:** Design for owner review; not implementation approval

**Scope:** Same-currency, customer-initiated internal transfers only. D0 remains NOT PASSED.

**Repository evidence reviewed:** `backend/src/database/migrations/0001_fluffy_post.sql:107-251`, `0002_phase_b_permission_correction.sql`, `0005_synchronous_projection_posting.sql:1-25`, `0008_phase_b_integrity_corrections.sql:1-96`, `backend/src/database/migrations/0009_phase_d_customer_transfers.sql:1-90`, `backend/src/database/schema/index.ts:396-555`, and `backend/src/modules/transfers/application/transfer-service.ts:27-154`.

## 1. Recommendation

Use one narrowly scoped, owner-owned `SECURITY DEFINER` PostgreSQL function as the financial transfer boundary. The application runtime role may execute that function, but must not receive direct `INSERT`, `UPDATE`, or `DELETE` privileges on Phase D tables or ledger tables.

The function must perform the complete transfer in one database transaction and call the existing controlled ledger functions for draft creation, entry creation, and posting. A separate posting-role connection is not recommended for the application transfer path because PostgreSQL transactions cannot safely span two connections and the existing posting role is intentionally not a general-purpose application writer.

This design is not approved for implementation until D0 verifies the existing role model, function ownership, `SECURITY DEFINER` behavior, and projection behavior.

## 2. Alternatives

### Recommended: transfer-specific `SECURITY DEFINER` function

An owner-owned function executes with `bg_bank_owner` privileges and has a fixed `search_path` of `pg_catalog, public`. `EXECUTE` is granted only to `bg_bank_runtime` (therefore reachable by `bg_bank_app`). `PUBLIC` execute is revoked.

Advantages:

- One connection and one transaction contain idempotency, locks, transfer state, ledger posting, audit, and outbox writes.
- The application receives no direct financial-table DML privileges.
- Existing `create_draft_journal`, `add_draft_journal_entry`, and `post_journal` remain the controlled ledger operations.
- PostgreSQL owns the critical race and consistency boundary.

Risks requiring D0 verification:

- The function owner and dependent-object ownership must be correct.
- Every dynamic or object reference must be schema-qualified; no mutable search path may be used.
- The function must validate its caller and actor input without assuming that `session_user` is the customer UUID.

### Rejected for the application path: restricted role transaction

The runtime connection could create a draft, while a separate posting connection posts it. This cannot provide one atomic transaction across both authenticated connections. Giving the runtime role direct DML on the Phase D tables and ledger tables would broaden the existing least-privilege boundary. Using `SET ROLE` is not sufficient unless the login role is already authorized for that role, and the current Phase A–C model deliberately separates runtime and posting capabilities.

The posting service connection remains appropriate for separately authorized operational posting tests or future service boundaries, but not for this customer transfer transaction unless the owner approves a redesigned role model.

## 3. Required transaction sequence

The transfer function must execute the following order on one connection and one transaction:

1. Validate caller identity and input shape. The function must require `session_user = 'bg_bank_app'` (or another explicitly approved login role) and distinguish that login identity from `current_user`, which may be `bg_bank_owner` inside a `SECURITY DEFINER` function. The inherited group role `bg_bank_runtime` is not itself an approved login identity.
2. Validate the authenticated actor UUID is an active user with exactly one customer record. The application must derive `p_actor_user_id` exclusively from its authenticated server-side session; it must never accept the actor UUID from the request body or caller-controlled authorization data. The database cannot independently authenticate the human when all requests share `bg_bank_app`; it validates the supplied actor and ownership as a defense-in-depth control.
3. Normalize and validate the idempotency scope, key, amount, currency, account IDs, and bounded reference. Recompute the canonical request representation and SHA-256 hash inside the function, then compare it to `p_request_hash`; an arbitrary caller-supplied hash must never be trusted.
4. Claim `(scope, key)` using the unique constraint in the same transaction as all financial work. A same-hash terminal row returns the stored result. A different hash raises a conflict. A competing request normally cannot observe an uncommitted `processing` row: it waits for the unique-key conflict until the first transaction commits or rolls back. After commit it re-reads the terminal row and replays or conflicts; after rollback it may retry the claim. The wait must be bounded by a statement/lock timeout and return the approved in-progress or dependency error on timeout. No separately committed claim is permitted.
5. Lock source and destination account rows using `SELECT ... FOR UPDATE` in ascending UUID order. The lock order must be identical for every transfer path.
6. Verify source ownership through `account_owners JOIN customers ON customers.id = account_owners.customer_id`, constrained by the authenticated actor UUID. Validate destination eligibility and the approved destination ownership rule.
7. Verify both accounts are active and not frozen, dormant, or closed; verify both account currencies equal the requested currency; reject self-transfer.
8. Lock and read the source projection after account locks. Reject when available balance is less than the positive integer minor-unit amount.
9. Insert the transfer in `created` state and its initial history row.
10. Call `create_draft_journal` with the authenticated human actor and request ID.
11. Call `add_draft_journal_entry` twice: debit the source ledger account and credit the destination ledger account, using the same currency and amount.
12. Call `post_journal`. The existing function performs journal validation and synchronous projection updates.
13. Update the transfer to `posted`, then `completed`, with required timestamps and history rows. The function must not expose an intermediate pending state to the HTTP client.
14. Insert the audit event and outbox event in the same transaction.
15. Store the terminal idempotency response and terminal timestamp.
16. Commit. Only after commit may the API return success.

No external calls, network requests, or asynchronous publication may occur inside this transaction.

## 4. Ownership and eligibility

The database function must enforce:

- The actor user exists and is `active`.
- The actor has a customer row.
- The source account has an `account_owners` row for that customer.
- The source account is `active` and linked to an active customer sub-ledger.
- The destination account is not the source, is `active`, has a valid customer sub-ledger, and has the approved relationship to the transfer. The owner must decide whether destination ownership is restricted to the same customer or any eligible sandbox customer account.
- Both account currency values equal the requested currency.
- The source available projection is sufficient.

The function must not trust a caller-supplied `customer_id`, account balance, ledger account ID, or authorization decision. Ledger account IDs must be resolved from locked account rows.

`session_user` proves only the database login role, not the human customer. The function must validate the exact approved login role, such as `bg_bank_app`, rather than accepting inherited `bg_bank_runtime` as an authentication identity. The application session remains the source of the human identity and must bind that identity to `p_actor_user_id`; the database function independently validates the supplied actor UUID and account ownership. Because all customers share `bg_bank_app`, the database cannot detect a compromised application that supplies another active customer's UUID. Binding a database role directly to every customer is not proposed.

## 5. Idempotency

Canonical hashing must use the exact normalized fields and stable key order already represented by `canonicalizeTransferRequest`: source account ID, destination account ID, decimal string minor amount, upper-case currency, and trimmed-or-null reference. The SHA-256 digest is stored as lowercase hexadecimal.

Scope is the stable operation scope `customer-transfer`; uniqueness is `(scope, key)`. The database unique constraint is authoritative under concurrency. The function recomputes the canonical hash from its normalized parameters and rejects any mismatch with the supplied digest before financial work.

| Situation | Required result |
|---|---|
| First request | Insert `processing`; continue in the same transaction. |
| Same key and same hash, terminal completed row | Return stored response; perform no financial work. |
| Same key and different hash | Return conflict; perform no financial work. |
| Same key while another request is processing | Wait only on the unique-key conflict within the same transaction; after the first commit replay or conflict, after rollback retry the claim, and return a bounded timeout error if the lock wait expires. |
| Database error before commit | Roll back all rows, including the claim; client treats outcome as indeterminate and retries the same key. |
| Terminal retention expires | Replace response data only under the approved cleanup policy while retaining a tombstone that prevents a different request hash from reusing the key. |

The exact 30-day terminal retention, tombstone duration, cleanup actor, and cleanup transaction require owner confirmation. The cleanup process must never delete protection for a still-reusable key.

## 6. Role and privilege matrix

This is the target design, not a grant change. Actual privileges require D0 verification.

| Principal | Phase A–C behavior | Phase D target behavior |
|---|---|---|
| `bg_bank_owner` | Owns protected tables/functions | Owns all Phase D tables and transfer function; not used as application login |
| `bg_bank_migrator` | Migration login, member of owner as established by `0001` | Creates/changes Phase D objects only through reviewed migrations; not used by runtime |
| `bg_bank_app` / `bg_bank_runtime` | Reads approved tables; runtime draft functions as granted | `USAGE` on `public` and `EXECUTE` only on the transfer function plus approved read functions; no direct Phase D DML and no direct posted-ledger DML |
| `bg_bank_posting_service` / `bg_bank_posting` | Executes `post_journal` and `reverse_journal` | Remains separate; no new broad table privileges for customer transfers |
| `bg_bank_readonly` | Read-only/reconciliation boundary | No transfer mutation privileges |
| `PUBLIC` | Existing public function execute revocations | No execute on the transfer function; no Phase D table privileges |

The migration must explicitly establish Phase D table ownership as `bg_bank_owner`, revoke unintended `PUBLIC` privileges, grant only required schema `USAGE`, and grant only the transfer function `EXECUTE` to `bg_bank_runtime`. It must not grant runtime `INSERT`, `UPDATE`, or `DELETE` on journals, entries, projections, or Phase D tables. The `public` schema must have `CREATE` revoked from `PUBLIC` (`REVOKE CREATE ON SCHEMA public FROM PUBLIC`); otherwise an untrusted role could create a same-named object in the SECURITY DEFINER search path and influence name resolution. D0 must verify that no application role or inherited role has an unintended `CREATE` grant on `public`.

The function owner must not be alterable by the application roles. D0 must verify function owner, `prosecdef`, `proconfig` search path, schema ACL, function ACL, and dependent-object modification restrictions.

## 7. Function contract

Proposed contract for owner review:

```text
public.execute_internal_transfer(
  p_actor_user_id uuid,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount_minor bigint,
  p_currency varchar(3),
  p_reference varchar,
  p_idempotency_key varchar,
  p_request_hash varchar(64),
  p_request_id varchar
) RETURNS jsonb
```

The returned JSON must contain only the customer-safe transfer ID, final state, journal timestamp/reference, amount, and currency. It must not expose ledger-entry internals, credentials, account numbers beyond the approved masked form, or SQL errors.

The function must use `LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public`, schema-qualify every application object, reject null/oversized inputs, and avoid dynamic SQL. If dynamic SQL becomes unavoidable, identifiers must be fixed allow-listed values and values must be parameterized.

The function must call the existing controlled functions rather than duplicating journal posting logic. It must pass `actor_type = 'human'`, the validated actor UUID, and the request ID to the existing functions.

## 8. Audit, history, and outbox

The same transaction must write:

- transfer creation and final state history;
- the existing journal status history generated by ledger functions;
- one audit event identifying the authenticated actor, transfer, request, and safe metadata;
- one versioned outbox event referencing the transfer aggregate;
- the terminal idempotency response.

The outbox worker is not part of this boundary. It must publish asynchronously and idempotently after commit. No outbox delivery failure may roll back a committed financial transfer.

## 9. Failure and rollback

Any validation, authorization, lock timeout, insufficient-funds, ledger-function, audit, outbox, or idempotency-finalization error must abort the transaction. The failed attempt must leave no transfer, journal, journal entries, projection update, history, audit, outbox, or idempotency claim committed.

The only exception is an intentionally committed terminal `rejected` result if the owner approves that state semantics. The current immediate-processing design should prefer transaction rollback for pre-posting failures and expose no pending state.

Post-commit response loss is recovered by retrying the same idempotency key. A timeout is never converted into a blind second transfer.

## 10. Direct-write protection

The design prevents direct application writes by:

- withholding Phase D table DML from `bg_bank_runtime`;
- withholding posted journal, journal-entry, and projection DML from application roles;
- revoking `PUBLIC` execute on the transfer function;
- exposing only the narrowly scoped transfer function to the runtime role;
- retaining existing append-only triggers and deferred balance checks;
- keeping `post_journal` and `reverse_journal` owner-controlled functions;
- verifying that the application login cannot inherit owner, migrator, or posting privileges.

The function must not call external services, accept arbitrary SQL, or expose a generic “run as owner” capability.

## 11. Threat analysis

| Threat | Control |
|---|---|
| Cross-customer source access | `account_owners` check inside the function and service-level session authorization |
| Forged customer UUID or compromised application identity | Active-user/customer validation is not sufficient if a compromised `bg_bank_app` process supplies another active customer's UUID. The application must bind the actor exclusively to the authenticated server-side session, reject client-supplied actor/customer identifiers, enforce session revocation/expiry and CSRF/origin controls, protect the session store and runtime credential, use strict object-level authorization, and audit authorization failures. Database validation is defense in depth, not independent human authentication. |
| Duplicate request | Scoped unique key, canonical hash, row locking, terminal replay/tombstone |
| Concurrent overdraft | Deterministic account locks and locked projection read |
| Currency mismatch | Composite `(account_id, currency)` foreign keys and function checks |
| Direct journal mutation | Existing role restrictions, controlled functions, immutable triggers |
| Function hijacking | Fixed search path, owner/ACL verification, no dynamic SQL |
| Outbox inconsistency | Same transaction as transfer and idempotency result |
| Credential/session compromise | Argon2id, opaque token hashes, expiry/revocation/CSRF; implementation still pending |
| Deadlock | Sort both account IDs before `FOR UPDATE`; bounded lock timeout and retry policy |

## 12. D0 prerequisites

Before any adapter implementation or migration execution, D0 must verify against the isolated D0 cluster:

1. Exact database, OID, PostgreSQL major version, and cluster identity.
2. Actual `session_user`, `current_user`, login attributes, inheritance, and role memberships for runtime, posting, readonly, migrator, and test connections.
3. Existing function ownership, `SECURITY DEFINER`, fixed search path, and `PUBLIC` execute revocation.
4. Runtime draft creation versus posting-role boundaries.
5. Direct DML denial on posted journals, entries, projections, and protected tables.
6. Deferred per-currency balancing, rollback, concurrent posting, and lock timeout behavior.
7. `reverse_journal` projection behavior. Any inconsistency is a blocker requiring a separately reviewed forward-only correction.
8. Phase D migration ownership and grants in a disposable isolated environment before use.

No D0 result may be inferred from static SQL alone.

## 13. Owner decisions and unresolved items

The owner must explicitly decide:

- same-customer-only versus any eligible customer destination accounts;
- whether rejected attempts are persisted or rolled back entirely;
- terminal retention and tombstone cleanup policy;
- bounded in-progress duplicate behavior: immediate conflict versus bounded wait;
- exact response JSON and masked account-reference contract;
- approved Argon2id dependency and credential bootstrap process;
- whether the transfer wrapper may be added as a new owner-owned SECURITY DEFINER function;
- final Phase D table grants after D0 confirms the existing role model.

Writing this design does not approve any migration, grant, function, adapter, or Phase D release.

## 14. Adapter GO/NO-GO criteria

Adapter implementation is **GO** only when:

- the owner approves this design and unresolved decisions;
- D0 passes all role, function, trigger, projection, rollback, and concurrency gates;
- the transfer migration and function are reviewed as forward-only changes;
- the Argon2id provider is installed, pinned, and tested;
- live tests prove ownership isolation, idempotency replay/conflict, insufficient funds, same-currency enforcement, rollback, concurrent transfers, audit/outbox atomicity, and immutable ledger behavior;
- no shared development resource is touched.

Otherwise the decision is **NO-GO**.
