# BG Bank

An AI-native **simulated** digital bank — a fintech backend engineering portfolio and learning project.

> ⚠️ Sandbox only. All payment rails (Raast, 1Link/IBFT, SEPA), KYC and regulators are simulated. Not a licensed bank. No real money, no real NADRA/SBP integration.

## What it demonstrates
- Double-entry ledger with chart of accounts, trial balance, immutable entries, reversals
- Transfers with idempotency, holds, state machines, concurrency safety
- Beneficiaries, limits, maker-checker, audit trail
- Pluggable regions (Pakistan first; EU/UK adapter second) via ports & adapters
- FX quotes with expiry, cross-border remittance, suspense accounts, reconciliation
- Fraud/AML rules and a governed AI layer (AI explains and recommends; deterministic code moves money)

## Repository layout
```
backend/    API, domain modules, workers
frontend/   Customer app + internal admin portal (React + TypeScript)
docs/       Architecture, standards, domain model, ADRs
.github/    CI workflows
CLAUDE.md   Engineering constitution for the AI agent
```

## Getting started
See `docs/PROJECT_OVERVIEW.md`. Setup instructions are added here once the stack is confirmed (`docs/adr/0001-technology-stack.md`).

```bash
cp .env.example .env   # then fill in local values — never commit .env
```

## Documentation
Start with `CLAUDE.md`, then `docs/`. Architectural decisions live in `docs/adr/`.
