# FantasyFantasy web app

Vue 3 + TypeScript client for the [FantasyFantasy API](../api/README.md), styled after the Arcane Tome redesign.
It replaces the legacy client in `../FantasyFantasy.client/`, which stays as a reference until this one covers it.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the Auth0 values
npm run dev                  # http://localhost:8080
```

Run the API alongside it (`cd ../api && npm run dev`).

## Auth0 settings (one-time, in the Auth0 dashboard)

In **Applications → your SPA application → Settings**, make sure these include the app's address:

| Setting | Value (local) |
|---|---|
| Allowed Callback URLs | `http://localhost:8080` |
| Allowed Logout URLs | `http://localhost:8080` |
| Allowed Web Origins | `http://localhost:8080` |

`VITE_AUTH0_AUDIENCE` must be the same API identifier the API validates (`AUTH0_AUDIENCE` in `api/.env`).

Also required:

- **Application Type:** Single Page Application (Authorization Code and Refresh Token grants enabled).
- **Refresh Token Rotation: on.** The app keeps tokens in local storage so sessions survive reloads (browsers block
  the third-party cookies Auth0's silent sign-in needs); rotation makes each refresh token single-use.
- **API access:** under Applications → APIs → your API, authorize this application for user access.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 8080 |
| `npm test` | Component and unit tests (jsdom) |
| `npm run lint` / `npm run typecheck` | ESLint and `vue-tsc` |
| `npm run build` | Type-check and build to `dist/` |

## Conventions

- **The API owns the rules.** Screens send intents and show what the API returns; no game logic in the client.
- **Components get the API by injection** (`useApi()`), so tests pass a fake client.
- **Design tokens** live in `src/styles/tokens.css`. The dashed gold border (`.note`) means something special or
  automatic is happening.
- **Crest emblem and banner keys** must match `api/src/modules/leagues/crests.ts`; a test enforces it.
