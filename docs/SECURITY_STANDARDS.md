# Security Standards

Even though BG Bank is simulated, it is built as if real. Follow OWASP Top 10 and OWASP API Security Top 10.

## Authentication & sessions
- Passwords hashed with Argon2id (or bcrypt with sane cost); never stored/logged.
- OTP + optional TOTP 2FA; rate-limit and lock out on abuse; OTPs single-use and short-lived.
- Phase 1 browser authentication uses opaque server-side sessions; browser access and refresh JWTs are not used. Sessions are revocable and device-aware.
- Phase 1 browser sessions use mandatory `HttpOnly`, `Secure`, and deliberate `SameSite` cookie settings. State-changing requests require CSRF validation and strict origin validation.
- Account recovery requires strong verification and notifies the customer.

Phase 1 browser authentication uses opaque PostgreSQL-backed server-side sessions, not browser JWT access or refresh tokens. Store only hashes of random session tokens. Customer sessions have recommended 30-minute idle and 7-day absolute timeouts; admin sessions have recommended 15-minute idle and 8-hour absolute timeouts. Rotate tokens after authentication and privilege elevation, revoke on logout/password change/recovery, and support device listing, per-device revocation and logout-all. New-device and risk-triggered challenges require OTP; admin users require TOTP and recovery codes. Cookie-authenticated state changes require CSRF validation and strict origin validation.

## Authorization
- **RBAC** for roles (customer, ops, compliance, finance, approver, admin) and **object-level authorization** on every resource (a customer can only access their own accounts/beneficiaries/cards).
- Deny by default. Re-check authorization in services, not just controllers.
- Admin actions that are sensitive require maker-checker (requester ≠ approver, enforced in code *and* DB constraint).

## Input/output
Validate all input at the boundary (type, range, length, format); parameterised queries only; output encoding; no mass-assignment; return minimal fields (no internal IDs/PII unnecessarily); mask sensitive data (account/card numbers).

## Rate limiting & abuse
Per-IP and per-user limits on login, OTP, transfers, beneficiary creation, AI endpoints. Velocity rules in the risk engine complement HTTP limits.

## Secrets & configuration
No secrets in code, logs, frontend bundles or Git. Use env/secret manager; rotate; `.env.example` placeholders only. Secret scanning in CI. Never print secret values when inspecting env files.

## Data protection
Minimise collected data; encrypt in transit (TLS) and sensitive fields at rest where appropriate; separate PII from ledger data where practical; retention policy documented; audit access to sensitive data.

## Audit logging
Log (append-only) logins, permission changes, approvals, freezes, adjustments, limit overrides, AI tool calls, config changes: actor, action, target, before/after, requestId, IP/device. Never log secrets.

## Dependency & supply chain
Lockfiles committed, dependency audit in CI, minimal dependencies, review new packages (maintenance, licence, size).

## AI-specific
Treat all model input/output as untrusted; defend against prompt injection (tools enforce permissions; instructions in data are ignored); never give an agent write access to ledger; see `AI_AGENT_GUIDELINES.md`.

## Never
Commit `.env` · hardcode credentials · print secrets · trust frontend authorization · expose another user's data · disable security checks to pass tests · skip object-level checks "for now".

## Review checklist (every PR touching money/auth)
- [ ] AuthN/AuthZ + object-level checks tested
- [ ] Input validation and error handling
- [ ] No sensitive data in logs/responses
- [ ] Idempotency & concurrency handled
- [ ] Audit entries written
- [ ] Rate limits on abusable routes
- [ ] Tests for abuse/failure cases
