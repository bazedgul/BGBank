# ADR 0001: Technology stack

- **Status:** Proposed
- **Date:** 2026-11-05

## Context
BG Bank needs strong transactional guarantees, row-level locking, modular structure, and a modern typed frontend. The owner's strongest stack is TypeScript/Node/React/PostgreSQL. The repository currently contains no application implementation or dependency manifests, so this ADR remains a recommendation pending implementation setup.

## Decision (proposed)
- **Backend:** NestJS + TypeScript.
- **Database:** PostgreSQL.
- **ORM/data access:** Drizzle ORM + Drizzle Kit, with controlled SQL/functions for ledger-critical paths.
- **Queue/worker:** PostgreSQL transactional outbox and an initial database-backed worker; Redis/BullMQ is deferred until a concrete throughput or scheduling need appears.
- **Frontend:** React + TypeScript + Vite, with design tokens and Storybook.
- **Package structure:** Separate `backend/` and `frontend/` package roots.
- **Identifiers:** UUID primary keys.
- **API contract:** REST under `/api/v1`, with OpenAPI generated from the backend.
- **Testing:** Jest or Vitest, Testing Library, Playwright, and real PostgreSQL integration tests.
- **AI:** Provider-agnostic port; provider selection remains an implementation/configuration decision.

## Open decisions (remain unresolved)
1. Exact Drizzle schema and migration conventions, including the boundary between Drizzle queries and PostgreSQL functions.
2. Worker polling, lease, retry and dead-letter operational limits.
3. Whether a later public/SEO surface justifies Next.js; Vite is the Phase 1 recommendation.
4. Exact authentication configuration; the accepted browser authentication architecture is recorded in ADR 0005.
5. Exact backend unit-test runner between Jest and Vitest.

## Alternatives considered
Django + DRF (strong ORM/admin, but different from the owner's main stack), Spring Boot (heavier), Go (great concurrency, steeper for this owner), Prisma (strong developer experience but more abstraction around critical SQL), and Next.js (more capability than the initial responsive web application requires).

## Consequences
Single language across stack; DI + modules map to domain boundaries; ledger-critical SQL stays explicit. These are proposed technology decisions, not implemented or verified choices. Acceptance of related ADRs does not change this ADR's Proposed status.
