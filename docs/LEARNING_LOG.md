# Learning Log

Append an entry after each feature. Purpose: the owner understands *why*, and can explain it in an interview.

```

## 2026-11-06 — Account lifecycle and restricted database runtime
**Concept:** Account state machines and least-privilege database functions.
**Why it exists in real banks:** An account must not become usable, frozen, dormant, or closed through arbitrary updates. Centralized transitions protect ownership, balance, audit, and authorization rules.
**How BG Bank implements it:** SECURITY DEFINER PostgreSQL functions lock the account row, validate the approved transition, require an active human actor, check posted-ledger evidence for dormancy and authoritative zero balance for closure, then write an audit event atomically. The backend launcher retrieves `bg_bank_app` credentials from Windows Credential Manager without storing the password in the repository.
**Failure it prevents:** Invalid lifecycle transitions, closing an account with money remaining, unaudited state changes, and ordinary runtime roles bypassing lifecycle controls.
**Interview-style question this answers:** Why should a banking account status change be a controlled database operation instead of a normal application update?
## <date> — <feature>
**Concept:** (e.g. idempotency keys)
**Why it exists in real banks:**
**How BG Bank implements it:** (files/modules)
**Failure it prevents:**
**Interview-style question this answers:**
```
