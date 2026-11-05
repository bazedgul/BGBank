# Project Overview

## Vision
BG Bank is an AI-native **simulated** digital bank. It exists to (1) be a credible fintech backend portfolio piece and (2) teach the owner how real banking systems work: ledgers, payment lifecycles, risk controls, compliance workflows and safe AI integration.

## Goals
- Demonstrate **financial correctness** (double-entry, immutability, idempotency, concurrency safety).
- Demonstrate **extensible architecture**: country-specific behaviour lives in adapters/config, not in the core.
- Show **responsible AI in banking**: governed, explainable, never in control of money.
- Provide a premium, simple customer UI and a separate internal operations portal.
- Be thoroughly documented so every decision is explainable in an interview.

## Non-goals
- Real money movement, real payment gateways, real NADRA/SBP/bank integrations.
- Lending / credit scoring (out of scope for v1).
- Native mobile apps (API + responsive web first).
- Claiming regulatory compliance or production readiness.

## Regions
- **Pakistan first** (PKR; simulated Raast, 1Link/IBFT; CNIC-style KYC; SBP-style limits; Urdu/English).
- **Second region later** (EU/UK-style: SEPA, passport + proof-of-address KYC, AMLD-style rules) added **only as adapters + config** to prove the core is region-agnostic.
- Cross-border remittance (e.g. UK/UAE → Pakistan) joins both.

## Users
| User | Uses |
|---|---|
| Customer | Accounts, transfers, beneficiaries, cards, statements, remittance, AI assistant |
| Operations employee | Failed payments, returns, reconciliation |
| Compliance employee | KYC review, AML alerts, cases |
| Finance employee | GL, trial balance, fees |
| Approver (checker) | Approves sensitive actions requested by another employee |

## How the owner works with the agent
The agent writes code; the owner learns. Therefore every feature ships with an explanation (see `AGENT.md` §4) and a `LEARNING_LOG.md` entry. Prefer clarity over cleverness.

## Disclaimer (include in README and UI footer)
Sandbox/simulated. Not a licensed financial institution.
