# ADR 0003: Money representation

- **Status:** Proposed
- **Date:** 2026-11-05

## Context
Floats cause rounding errors. Currencies have different minor-unit exponents (PKR 2, JPY 0, KWD 3).

## Decision (proposed)
Store `amount_minor BIGINT` plus `currency CHAR(3)`. Use a central `Money` value object with a currency exponent table, explicit rounding mode, and no cross-currency arithmetic. Store FX rates as `NUMERIC(18,8)` and convert only through an FX quote.

Journals must balance independently for every currency. FX operations use linked currency-specific journals and explicit accounts for fees, spreads, rounding and FX gain/loss. A PKR amount may never balance a USD amount merely because the numeric values match.

## Alternatives considered
`NUMERIC(20,4)` columns are simpler to inspect in SQL but assume a fixed precision model and create risk around currencies with different scales. They remain a possible alternative only if a later design provides a clear justification.

## Consequences
Exact arithmetic; formatting handled in one place; tests for rounding at defined points. This ADR remains Proposed until separately accepted and describes a working recommendation, not an implemented or verified schema.
