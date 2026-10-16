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
| `npm run dev:league -- --pin K7QX4M --add-bots 3` | **Development only:** add bot parties, `--run-draft` to make a scheduled draft due, `--weeks-due 3` to fast-forward weeks |
| `npm run import:stats -- --seasons 2011-2025` | Import nflverse weekly stats into MongoDB (idempotent; safe to re-run) |

## Endpoints

Everything under `/api` requires an Auth0 access token (`Authorization: Bearer ...`).

| Method & path | Who | What |
|---|---|---|
| `GET /health` | anyone | Liveness and DB status |
| `GET /api/account` / `PATCH /api/account` | self | Read or update display name / picture |
| `POST /api/leagues` | anyone | Create a league along with the host's party |
| `GET /api/leagues/mine` | self | Leagues I'm in, with my party |
| `GET /api/leagues/public?page=` | anyone | Public leagues with open slots |
| `GET /api/leagues/pin/:pin` | anyone (rate-limited) | Preview a league before joining |
| `POST /api/leagues/join` | anyone (rate-limited) | Join by PIN with a new party |
| `GET /api/leagues/:id` | members; anyone if public | League details and parties |
| `PATCH /api/leagues/:id` | host, while forming | Edit name, visibility, cadence, max parties |
| `POST /api/leagues/:id/cancel` | host | Cancel the league |
| `POST /api/leagues/:id/leave` | members except host, while forming | Leave the league |
| `DELETE /api/leagues/:id/parties/:partyId` | host, while forming | Remove a member's party |
| `PATCH /api/parties/:id` | party owner | Rename a party or change its crest |
| `POST /api/leagues/:id/draft` | host | Schedule (or reschedule) the draft; builds the hidden hero pool and locks membership |
| `GET /api/leagues/:id/heroes` | members; anyone if public | The league's hero pool (never the real players) |
| `GET` / `PUT /api/leagues/:id/rankings` | members, before the draft | Read or replace my party's hero ranking |

| `GET` / `PUT /api/leagues/:id/lineup` | members | My roster, lineup, Champion, and who is resting next week; set the lineup while the season runs |
| `PUT /api/leagues/:id/champion` | members | Name a starter as Champion for the next battle (`{ heroId }`, or `null` to withdraw) |
| `GET /api/leagues/:id/schedule` | members; anyone if public | 14 weeks of matchups, resolve times, and results so far |
| `GET /api/leagues/:id/results/:week` | members; anyone if public | A resolved week (per-hero damage rounded) |
| `GET /api/leagues/:id/standings` | members; anyone if public | Wins, losses, draws, total damage |

Leagues advance lazily: any request for `/api/leagues/:id/...` first runs a due draft and resolves due game weeks,
so no background worker is needed.

## Conventions

- **The server owns all game rules.** Clients send intents ("join league", "set lineup"), never whole documents.
- **Validate every request body with Zod** inside the route. Validation errors become 400 responses automatically.
- **Throw `HttpError` subclasses** (`src/lib/errors.ts`) for expected failures. Anything else is logged and returned as a generic 500.
- **Identity comes from the verified token only** (`currentAccount(req)`), never from the request body.
- **Hidden-player rule:** never serialize NFL player identity or a league's season to clients while a league is active.

## NFL stats data

Weekly player and team stats come from [nflverse](https://github.com/nflverse/nflverse-data) under
[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). **The app must show visible attribution**,
e.g. "Stats data provided by nflverse".

- Only regular-season QB / RB / WR / TE lines and team defenses are imported.
- Team codes are stored as current franchise codes (STL → LA, SD → LAC, OAK → LV).
- 2011–2025 is about 49 MB including indexes and takes roughly 9 minutes against the Atlas free tier.
- Scoring lives in `src/modules/scoring` and follows [docs/CLASSIC_SCORING.md](../docs/CLASSIC_SCORING.md).
  It is verified to match nflverse's own half-PPR numbers for every 2023 player-week.
