# Frontend Standards

React + strict TypeScript (recommended: Next.js app router or Vite). Two surfaces: **Customer app** and **Admin portal** sharing one design system.

## Atomic Design
| Level | Examples | Rule |
|---|---|---|
| **Atoms** | Button, Input, Label, Icon, Badge, Spinner, MoneyText | No business logic, styling via tokens, variants via props |
| **Molecules** | FormField, SearchBar, BalanceCard, StatusPill, AmountInput | Compose atoms |
| **Organisms** | TransactionTable, AccountSummary, TransferForm, SideNav, ApprovalPanel | May use hooks/API data via props or feature hooks |
| **Templates** | AuthLayout, DashboardLayout, AdminLayout | Layout only |
| **Pages** | Dashboard, Transfer, Statements, KycReviewQueue | Wire data to templates/organisms |

```
frontend/src/
  design-system/   tokens, atoms, molecules (shared primitives)
  components/      organisms/templates shared across features
  features/<domain>/ domain-specific organisms, hooks, api, types
  pages|app/       routes
  lib/             api client, formatting, utils
```

## Reuse protocol (mandatory)
1. **Search first:** read `frontend/COMPONENTS.md` and grep the codebase.
2. If it exists → use it. If it almost fits → **extend with a variant/prop**, don't fork.
3. If it doesn't exist → build it **once** in the correct atomic level, then register it in `frontend/COMPONENTS.md` (name, level, props summary, usage).
4. Never create a second Button/Input/Card/Modal with different styling. Don't create a component for every tiny element either — reuse needs a real second use or being a primitive.
5. Domain-specific UI lives in `features/<domain>`; promote to shared only when a second domain needs it.

## UI/UX quality bar — premium yet simple
- Looks like a modern consumer fintech product (clean, calm, confident), **not** a generic admin template.
- **One design-token system** (colors, spacing scale, radii, shadows, typography, motion) defined once; no hardcoded hex/px in components.
- Strong visual hierarchy: one primary action per screen; generous whitespace; consistent type scale.
- **Money is easy to read:** tabular numerals, right-aligned in tables, currency code/symbol, clear +/− and status colour *plus* icon/text (not colour alone).
- Complete states everywhere: loading (skeletons), empty (helpful), error (human message + next step), success, confirmation for risky actions (summary → confirm).
- Fewer steps, plain language, progressive disclosure; sensible defaults; undo/cancel where banking rules allow.
- Responsive (mobile-first), keyboard accessible, **WCAG 2.1 AA**: semantic HTML, labels, focus states, contrast, ARIA only when needed, reduced-motion support.
- Light/dark readiness through tokens.
- Bilingual-ready (English/Urdu, RTL-capable layout) — keep copy in i18n files from the start.

## Code quality
- `strict` TS; no `any` without a justifying comment. Shared types generated from/aligned with API contract (OpenAPI).
- Components are small and focused; extract hooks for logic; separate **API layer** (typed client, query hooks) from presentation.
- Predictable state: server state via a query library (e.g. TanStack Query), minimal client state, no duplicated server data in global stores.
- Consistent API error handling (error boundary + toast/inline mapping of backend `code`).
- Avoid needless re-renders; memoize deliberately, measure first.
- Forms: schema validation (e.g. Zod) for UX only — **backend is the authority**.

## Hard rules
- The frontend is **never** the source of truth for balances, limits, fees, authorization or validity. Display what the API returns; never recompute banking rules client-side (a dry-run/quote endpoint provides previews).
- No secrets in the bundle. Tokens in secure storage per `SECURITY_STANDARDS.md`.
- Never trust hidden/disabled UI as authorization.

## Testing
Unit/component tests (Testing Library) for atoms→organisms, accessibility checks (axe), e2e for critical flows (login, transfer, approval). Visual review via Storybook (recommended) for the design system.

## `frontend/COMPONENTS.md` (create at first component)
Table: `Component | Level | Location | Props/variants | Used by`. Keep it updated in every PR that adds a shared component.
