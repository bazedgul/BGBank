# BG Bank backend

The backend foundation is a NestJS modular monolith using TypeScript, PostgreSQL, and Drizzle ORM.

## Local setup

From this directory:

```powershell
pnpm install
Copy-Item ..\.env.example .env
```

Before starting the application, replace the placeholder database values in `.env` with local sandbox values. Never commit `.env`.

Start the API:

```powershell
pnpm dev
```

The health endpoint is:

```text
GET http://localhost:3000/api/v1/health
```

It returns HTTP 200 when PostgreSQL is reachable and HTTP 503 when the database readiness check fails. The response never includes connection details.

## Checks

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Database migrations will be added only with an approved domain implementation phase. The current Drizzle configuration provides the migration entry point without introducing banking tables.
