# AI Agent Guidelines (inside BG Bank)

Two different "AIs" exist — don't confuse them:
1. **The coding agent** that builds the repo (governed by the authoritative `AGENT.md`).
2. **Product AI agents** inside BG Bank (customer assistant, investigator, compliance copilot…) governed here.

## Core rule
AI **recommends, explains, classifies and drafts**. Deterministic backend code **decides and executes** money movement. AI never writes the ledger, never bypasses KYC/AML/fraud/limits, never approves sensitive actions.

## Permission model
Each agent has an explicit identity, scope and allow-list of tools.

| Capability | Permission |
|---|---|
| Read the customer's own transactions/balances | Allowed (scoped to that customer) |
| Generate insights/explanations | Allowed |
| Create payment **draft** | Allowed |
| Execute transfer | **Explicit customer confirmation** (confirmation screen + backend re-validation) |
| Freeze account / adjust ledger / change limits | **Human + maker-checker**; AI may only *recommend* |
| Approve KYC/AML case outcomes | Human only |

Permissions are enforced **in the backend tool layer**, not by prompt text.

## Tool design
- Fixed, typed, pre-scoped tools (e.g. `get_transactions(customerId from session, filters)`), read-only by default.
- **No AI-generated SQL.** Natural-language search maps to structured filters → fixed query functions.
- Tools receive the *caller's* identity from the session, never from model-provided IDs.
- Write-capable tools only create **drafts/requests** that pass through normal deterministic APIs and checks.

## Traceability
Every answer cites underlying record IDs (transactions, journals, rules fired). Log in `ai_action_log`: agent, tool, params, permission decision, result refs, model/version, latency. Recommendations are stored with the evidence used.

## Safety
- Treat model output and any retrieved text (merchant names, memos, documents) as **untrusted** — prompt injection must not alter permissions or actions.
- Validate model output against schemas; reject/repair invalid output.
- Data minimisation: send only fields needed; mask PII; no secrets in prompts.
- Human-in-the-loop for sensitive/irreversible actions; show confirmation summaries generated from backend data, not model text.
- Clear UX labels: AI-generated, with link to evidence.
- Fallback when AI is down: core banking unaffected.

## Feature notes
- **Transaction investigator / "Why did this fail?":** backend gathers ledger entries, fraud decision reasons, limit checks; AI composes the explanation (Urdu/English) strictly from provided facts; if data is missing it says so.
- **Payment dry-run:** deterministic endpoint returns fees/limits/risk/expected balances; AI only explains.
- **Compliance copilot:** summarises alert clusters with evidence links; humans decide.
- **Voice banking:** speech → intent → structured draft → read-back confirmation → deterministic execution.
- **Dispute assistant:** assembles evidence + suggested category; employee decides.

## Evaluation
Maintain a small eval set per agent (golden Q&A with expected record references, injection attempts, permission-escape attempts). Run in CI where practical.
