# Identity-service boundary

The identity service is a separate process with its own connection pool and a
dedicated PostgreSQL login. The general API has no identity database
credential, pool, table access, or identity-function grants.

The identity process is trusted to perform Argon2id password verification.
PostgreSQL enforces role separation and function privileges, but cannot
independently attest that the service verified a password before requesting a
session. This is an explicit trust boundary.

Migration 0013 creates the fixed `NOLOGIN` group role `bg_bank_identity`.
Deployment provisions a separate LOGIN role and grants it membership in that
group through secret-managed deployment automation. Passwords and connection
strings never appear in migrations or repository files.

Example deployment procedure (run only by the approved deployment identity,
with the password injected directly from the secret manager; never place the
password in shell history, SQL files, logs, or source):

```sql
CREATE ROLE bg_bank_identity_login LOGIN PASSWORD '<secret-manager-value>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT bg_bank_identity TO bg_bank_identity_login;
```

The LOGIN role must not be a member of `bg_bank_owner`, `bg_bank_migrator`,
`bg_bank_runtime`, or `bg_bank_posting`. Verify with:

```sql
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
       rolbypassrls, rolcanlogin
  FROM pg_roles WHERE rolname = 'bg_bank_identity_login';
SELECT pg_get_userbyid(member) AS member, pg_get_userbyid(roleid) AS granted_role
  FROM pg_auth_members
 WHERE member = 'bg_bank_identity_login'::regrole;
```

The deployment LOGIN role is separate from the fixed `NOLOGIN` group role.
The expected membership result is exactly `bg_bank_identity`.

The API-to-identity channel must use authenticated service-to-service
authentication, bounded request and response timeouts, fail-closed errors, and
redaction of credentials, cookies, bearer tokens, password hashes, and session
material from logs. No migration contains a password or connection string;
the identity login is provisioned by deployment secret management.
Provisioning order is mandatory: (1) an owner-approved bootstrap creates
`bg_bank_identity NOLOGIN`; (2) migration 0013 verifies that role and applies
function ownership and grants; (3) deployment creates the separate LOGIN role
and grants it membership only in `bg_bank_identity`; (4) the identity process
starts with `IDENTITY_DATABASE_URL`. Migration 0013 does not attempt role
creation because the migration runner is not assumed to have `CREATEROLE`.

Reverse proxies, tracing exporters, and request loggers must redact
`Authorization`, request fields named `password` or `token`, and response or
metadata fields named `tokenHash`, `csrfTokenHash`, `passwordHash`, or
`credentialHash`. This repository does not claim infrastructure-level
redaction verification.

During rollout, existing valid sessions remain valid. They are revoked only by
normal expiry, logout, logout-all, or a separately approved incident response.

Logout-all accepts only the currently presented raw session token. The
identity service validates it, derives the user ID inside the identity
boundary, and revokes that session and all sibling sessions. The API clears the
cookie and returns HTTP 204.

Tests are classified as static migration tests or mocked service tests. No
real-PostgreSQL verification is claimed here; that requires explicit approval
and a separately configured test database.
