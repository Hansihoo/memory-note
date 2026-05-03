# Local Development

This project can run locally without production DB or external service access.

## Environment

Create `.env` at the repository root. This file is ignored by git.

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_DEBUG_IMPORT=false
VITE_DEBUG_SESSION=false
VITE_DEBUG_PROGRESS=false
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_API_KEY=
VITE_GOOGLE_APP_ID=

DATABASE_URL=sqlite:///./apps/api/.data/memory_assistant.db
GOOGLE_CLIENT_ID=
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
LOG_LEVEL=warn
DEBUG_IMPORT=false
DEBUG_SESSION=false
DEBUG_PROGRESS=false
DEBUG_AUTH=false
AUTH_TOKEN_TTL_HOURS=168
```

## Local DB

Default local DB:

```env
DATABASE_URL=sqlite:///./apps/api/.data/memory_assistant.db
```

Optional local PostgreSQL example:

```env
DATABASE_URL=postgresql://memory_user:memory_password@localhost:5432/memory_assistant
```

There is currently no `docker-compose.yml` in this repository, so no Docker DB command is required for the default local SQLite setup.

## Migration

Run:

```powershell
pnpm run api:migrate
```

The command creates the SQLite DB file if needed and runs the compatibility migration used by the API startup path.

## Run Locally

```powershell
pnpm run dev
```

API: `http://localhost:8000`  
Web: `http://localhost:5173`

## Auth Token Flow

The web app stores the issued bearer token automatically after signup or login and sends it as:

```http
Authorization: Bearer <token>
```

Manual API testing only needs this header after calling `/auth/register` or `/auth/login`.
