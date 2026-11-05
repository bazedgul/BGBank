# Product Requirements

**Principle:** every feature needs a banking use case, backend business logic and a technical learning objective. Quantity is not a goal.

## Priorities

P0 identifies product priority and importance. It does not mean every P0 capability is delivered in Phase 1. Delivery is controlled by the phase plan below.

### P0 — Core (without these it is not a bank)
| Module | Features | Learning objective |
|---|---|---|
| Ledger + GL | One double-entry ledger, chart of accounts, journals, immutable entries, reversals, trial balance | Accounting model; why balances are derived |
| Accounts | Savings/current, lifecycle (pending/active/frozen/dormant/closed), multi-currency wallets | State machines |
| Auth + KYC | Signup, OTP, 2FA, sessions, trusted devices, recovery, KYC tiers (simulated docs) | Onboarding workflows, security |
| Transfers | Internal transfer, idempotency, state machine, holds/pending, cancellation rules | Atomicity, concurrency |
| Balances | Ledger vs available balance, active holds | Authorization vs posting |
| Limits | Per-txn, daily, monthly, velocity, per-beneficiary, by KYC tier | Risk control |
| Beneficiaries | Add, verify, cooling period, block/unblock, daily beneficiary limit, first-transfer fraud check | Payment security |
| Maker-checker | Requester ≠ approver, approval expiry, payload-hash match, full audit | Internal controls |
| Audit | Immutable audit log, RBAC | Accountability |
| Statements | History, filters, PDF/CSV, receipts | Reporting |
| Notifications | Outbox pattern, preferences, delivery tracking | Reliable events |

### P1 — Real banking behaviour
- **Payment rails (simulated):** Raast, 1Link/IBFT, SEPA as adapters.
- **Payment orchestration:** rail selection, fees, ETA, fallback routing, retries, **circuit breaker**.
- **Suspense/clearing accounts**, **payment returns** (return codes, investigation), **reconciliation** (own ledger vs simulated external statement).
- **FX & quotes:** rate snapshot, spread, fee, quote expiry, execute the *same* quote that was shown.
- **Fraud rules engine** (velocity, unusual amount, new device, geo mismatch, first-transfer-to-new-beneficiary).
- **AML alerts + case management.**
- Cards (virtual, freeze, limits, authorization vs settlement), bill payments (mock biller), scheduled jobs (interest, fees, standing orders).
- KYC operations queue (document review, rejection reasons).

### P2 — AI & differentiators
- **AI permission & approval layer** (foundation for all AI features).
- **AI Transaction Investigator** ("Where did PKR 8,500 go?" — traced to ledger records) and **"Why did this fail?" explainer** (Urdu/English).
- **Compliance copilot** (investigation summaries for suspicious clusters).
- **Payment dry-run** ("If I send PKR 50,000, what happens?" — deterministic simulation; AI only explains).
- **Natural-language banking search** via fixed read-only tools (no AI-generated SQL).
- **Cross-border remittance** flow.
- Emergency wallet lock.

### P3 — If time allows
Voice banking (Roman Urdu/Urdu intent → confirmation → deterministic execution), committee (ROSCA) wallet, escrow simulation, dispute management (+ AI dispute assistant; humans decide), programmable money rules, family/shared wallets, webhooks (if merchant side exists), cashflow forecasting.

### Explicitly deferred / dropped
Product recommender, salary-advance/lending, financial health score, merchant-specific wallets, bill splitting, a separate "life events predictor" (covered by cashflow forecasting), 5-workspace dashboard (start with 3: Operations, Compliance, Finance).

## Phases
1. Ledger + accounts + idempotency + immediate atomic same-currency internal transfers. Ledger entries are authoritative and synchronous balance projections are updated in the same posting transaction.
2. Limits + full hold lifecycle (create, capture, release, expiry) + pending/external payment flows + statements + outbox
3. Fraud rules + admin + audit + maker-checker + beneficiaries
4. FX + remittance + orchestration + second-region adapter + reconciliation
5. AI layer
6. Load & concurrency proof; README with architecture diagram

## Feature spec template (copy into `docs/features/<name>.md`)
```
# Feature: <name>
## Business problem / use case
## Users & workflow
## Business rules (numbered)
## State machine (if any)
## Domain owner (module)
## Database changes
## API contract
## Frontend changes (reuse list)
## Security considerations
## Failure scenarios
## Test plan
## Learning objective
## Open questions
```
