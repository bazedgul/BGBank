# ADR 0005: Browser authentication and sessions

- **Status:** Accepted
- **Date:** 2026-11-05
- **Decision owner:** Project Owner

## Context
The React + Vite browser client needs revocable authentication for customer and administrative operations. Banking sessions require logout-all, device management, recovery invalidation and strong protection against token theft and cross-site requests.

## Decision
Phase 1 uses opaque server-side sessions stored in PostgreSQL. The browser receives a cryptographically random session token in an `HttpOnly`, `Secure` cookie. The server stores only a hash of the token. Browser access and refresh JWTs are not used in Phase 1.

Customer sessions have a recommended 30-minute idle timeout and 7-day absolute lifetime. Admin sessions have a recommended 15-minute idle timeout and 8-hour absolute lifetime. These values are configurable and must not be hardcoded in application logic.

Session tokens rotate after authentication and privilege elevation to prevent fixation. Logout revokes the session and clears the cookie. Logout-all revokes all sessions for the principal. Password reset, account recovery, suspicious-token reuse and relevant security changes revoke affected sessions.

Cookie-authenticated state changes require CSRF protection, SameSite cookies and strict origin validation. CORS allows only configured frontend origins. New-device and risk-triggered authentication challenges require OTP. Admin users require TOTP and recovery codes.

## Alternatives considered
- Browser JWT access and refresh tokens — rejected for Phase 1 because revocation, reuse detection and logout-all require additional state while offering no necessary benefit for this browser application.
- Raw session tokens stored in the database — rejected because a database read would expose usable credentials.
- JWT plus server-side sessions — rejected for Phase 1 because it mixes two authority models without a concrete requirement.

## Trade-offs
Requests require a database-backed session lookup or cache. The benefit is immediate revocation, device management and clear server-side authority. Cookie authentication requires deliberate CSRF protection.

## Consequences
Argon2id is used for passwords. OTPs are short-lived, single-use, rate-limited and never logged. Sensitive admin actions require re-authentication and maker-checker authorization. Exact session schema, recovery UX, challenge thresholds and operational rate limits remain implementation details. This ADR records an accepted architecture decision; no implementation or verification is implied.
