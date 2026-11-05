# ADR 0002: Single double-entry ledger with chart of accounts

- **Status:** Accepted
- **Date:** 2026-11-05

## Context
Early idea: a "Customer Ledger" and a separate "Bank General Ledger". Two ledgers need continuous synchronisation and invite drift bugs.

## Decision
One ledger. A chart of accounts classifies accounts (asset, liability, equity, income, expense). Each customer account is a **sub-ledger account** under the **Customer Deposits (liability)** control account. The GL, trial balance and customer balances are all views over the same journals/entries.

## Alternatives considered
- Separate customer ledger + GL with sync jobs — rejected (consistency risk, duplicated logic).
- Balance column updated in place — rejected (no audit trail, race conditions).

## Trade-offs
Slightly more modelling upfront (chart of accounts) in exchange for provable consistency: Σ sub-ledgers = control account, trial balance = 0.

## Consequences
All money movement = journal with balanced entries. Reports derive from entries. Invariants tested in CI.
