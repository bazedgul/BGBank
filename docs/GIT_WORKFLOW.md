# Git & GitHub Workflow

## Branching
- `main` — stable, always deployable, protected. **Never commit directly.**
- `develop` — optional integration branch (use only if needed).
- `feature/<name>` · `fix/<issue>` · `refactor/<module>` · `docs/<topic>` · `chore/<task>`
- Short-lived branches; rebase/merge `main` regularly.

## Commits — Conventional Commits
`<type>(<scope>): <summary>` with types `feat, fix, refactor, docs, test, chore, build, ci, perf`.
Examples: `feat(ledger): add journal posting service`, `test(transfers): cover concurrent debits`, `docs(adr): record single-ledger decision`.
- One logical change per commit; no unrelated changes mixed; no WIP noise in the final history.
- Never commit secrets, `.env`, build output or large binaries.

## Pull requests
Every meaningful change goes through a PR with this template:
```
## What changed
## Why
## Architecture implications
## Database migrations (and rollback notes)
## Tests performed (commands + results)
## Security implications
## Screenshots (UI changes)
## How it works (learning notes) / docs updated
## Checklist: CI green · docs updated · no secrets · reuse checked (frontend)
```
Keep PRs small and reviewable. Squash or rebase-merge per repo policy.

## Rules for the agent
- Don't work on `main`. Create a branch first.
- **Never commit, push, open/merge PRs, force-push or rewrite shared history without explicit permission.** Propose the commit/PR text instead.
- Never merge with failing CI. Never skip hooks to bypass checks.

## Branch protection (recommended GitHub settings)
Require PR · require status checks (backend, frontend, security) · require up-to-date branch · require review (self-review checklist if solo) · block force pushes · enable secret scanning and Dependabot.

## Releases
Semantic versioning + changelog (generated from Conventional Commits). Tags only with approval.
