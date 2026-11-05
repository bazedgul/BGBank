# Engineering Principles

Use judgment. A principle is a tool for a real problem, not a checklist. Under-engineering and over-engineering are both bugs.

When you finish a feature, name which principles you applied and where (see `AGENT.md` §4).

## SOLID — with BG Bank examples
- **S – Single Responsibility:** `TransferService` orchestrates a transfer; `LimitEvaluator` decides limits; `LedgerPostingService` writes journals. A controller never calculates fees.
- **O – Open/Closed:** Adding a rail (e.g. SEPA) = new `PaymentRailAdapter` implementation + config, no edits to `PaymentOrchestrator` core logic.
- **L – Liskov:** Every `PaymentRailAdapter` honours the same contract (including timeout → `unknown`, never silently `failed`). Swapping Raast-sim for SEPA-sim must not break callers.
- **I – Interface Segregation:** Small ports: `RailSubmitter`, `RailStatusChecker`; don't force every adapter to implement irrelevant methods.
- **D – Dependency Inversion:** Application services depend on ports (`KycProvider`, `PaymentRail`), not on concrete simulated providers.

## Other principles
- **DRY** – one source of truth for each rule (e.g. limit calculation lives only in `limits`). *But* don't merge things that merely look alike; duplication is cheaper than the wrong abstraction.
- **KISS** – prefer the simplest design that is correct. Plain functions beat class hierarchies.
- **YAGNI** – no speculative features, generic frameworks or unused extension points. Build the adapter interface when the second implementation is planned (it is, for regions), not before.
- **Separation of concerns** – transport, validation, business rules, persistence, integrations are separate.
- **Composition over inheritance** – compose services; avoid deep class trees.
- **Explicit over implicit** – explicit state transitions, explicit currency, explicit transaction boundaries; no hidden side effects.
- **Fail safely & predictably** – on doubt, don't move money: reject, or mark `unknown` and reconcile.
- **Least privilege** – roles, DB users, AI tool permissions are minimal.
- **Defense in depth** – validate at the API, in the domain *and* with DB constraints (CHECK, FK, UNIQUE).
- **Secure by default** – new endpoints require auth and authorization unless explicitly public.

## Anti-patterns to avoid
God services/classes/components, giant files, circular dependencies, premature abstraction, copy-pasted components, hardcoded config, dead code, unused dependencies, swallowed errors, tiny files created only to look modular.

## Rule of three for abstractions
Extract shared code on the **third** genuine use, unless it is a primitive UI component or a financial invariant (those are centralised from the start).
