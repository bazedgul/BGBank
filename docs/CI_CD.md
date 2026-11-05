# CI/CD Standards

GitHub Actions in `.github/workflows/`. **Do not deploy automatically to production.** Production deploys need explicit approval and a protected environment.

## Workflows
| Workflow | Trigger | Jobs |
|---|---|---|
| `backend-ci.yml` | PR / push (backend paths) | install (cached) → format/lint → typecheck/static analysis → unit tests → integration tests (Postgres service container) → migration check (up on empty DB; schema drift) → dependency audit |
| `frontend-ci.yml` | PR / push (frontend paths) | install (cached) → format → lint → type-check → unit/component tests → a11y checks → production build |
| `security.yml` | PR + weekly schedule | secret scanning (e.g. gitleaks), dependency vulnerability scan, CodeQL |
| `e2e.yml` | PR to main / nightly | critical flows (login, transfer, approval) against a test stack |
| `deploy-staging.yml` | merge to `main` | build + deploy to staging (when infra exists) |
| `deploy-production.yml` | manual, protected environment | requires approval; separate secrets |

## Standards
- Cache dependencies; run jobs in parallel where possible; fail fast.
- Test DB is ephemeral; never point CI at real data.
- Secrets only via GitHub Secrets/Environments; separate dev/staging/prod.
- Required status checks on `main` (see `GIT_WORKFLOW.md`).
- Concurrency tests and invariant tests (`trial balance = 0`) run in CI.
- Pin action versions; least-privilege `permissions:` on workflows.

## Initial setup order
1. backend-ci + frontend-ci (once code exists)
2. security.yml (secrets + deps)
3. e2e for the first money flow
4. staging deploy (optional, later)
