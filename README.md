# Relay

Relay is a personal, evidence-backed AI infrastructure intelligence dashboard.
It will connect source claims to infrastructure layers, companies, and evolving
investment theses.

This repository currently contains the secure project foundation only. Product
screens, ingestion adapters, model integrations, and research data are not part
of the initial baseline.

## Stack

- React, Vite, and TypeScript
- Tailwind CSS
- Hono on Node.js
- Vitest and ESLint

SQLite and the intelligence pipeline will be added when their product contracts
are defined.

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Local development

```bash
npm install
npm run dev
```

The web application runs at `http://127.0.0.1:5173`. The API runs at
`http://127.0.0.1:8787` and is proxied through `/api` during development.

## Verification

```bash
npm run check
```

This runs linting, TypeScript checks, tests, and production builds.

## Security defaults

- Local services bind to `127.0.0.1` by default.
- Environment files, credentials, databases, imported documents, and local
  analysis are ignored by Git.
- The server applies secure HTTP headers.
- CI uses read-only repository permissions.
- Dependabot monitors npm and GitHub Actions dependencies.

Never commit paid research, API keys, session tokens, private filings, generated
local databases, or source material that cannot be redistributed.
