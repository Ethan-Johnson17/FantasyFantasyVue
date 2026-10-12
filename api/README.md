# FantasyFantasy API

TypeScript backend for FantasyFantasy. It replaces the legacy server in `../FantasyFantasy/`, which stays as a reference until this one does everything it did.

## Requirements

- Node 24 LTS (`nvm install 24` then `nvm use 24`)
- A MongoDB Atlas connection string and an Auth0 API (domain + audience)

## Setup

```bash
npm install
cp .env.example .env   # then fill in values; .env is gitignored
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm test` | Run tests against an in-memory MongoDB (no Atlas or Auth0 needed) |
| `npm run lint` | ESLint with strict type-aware rules |
| `npm run typecheck` | TypeScript check |
| `npm run build` / `npm start` | Compile to `dist/` and run it |

## Conventions

- **The server owns all game rules.** Clients send intents ("join league", "set lineup"), never whole documents.
- **Validate every request body with Zod** inside the route. Validation errors become 400 responses automatically.
- **Throw `HttpError` subclasses** (`src/lib/errors.ts`) for expected failures. Anything else is logged and returned as a generic 500.
- **Identity comes from the verified token only** (`currentAccount(req)`), never from the request body.
- **Hidden-player rule:** never serialize NFL player identity or a league's season to clients while a league is active.
