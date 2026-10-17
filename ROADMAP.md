# FantasyFantasy Roadmap

Fantasy football meets Dungeons & Dragons: players build a party of fantasy heroes whose
combat strength is driven by real NFL player performance behind the scenes.

## Product decisions (as of 2026-10-10)

- **Platforms:** iOS, Android, and web.
- **Cost:** free to play. No gambling, paid entry, or prizes. Revisit monetization later.
- **Budget:** $0 infrastructure for as long as possible (MongoDB Atlas free tier, free-tier hosting/auth).
- **Stats data:** we own our database of historical NFL stats rather than depending on a paid or third-party live API.

## MVP: Classic mode only

> Party-on-party · 100% fantasy

Create a party using pre-made heroes and face off against opponents' parties in your league.

- Each hero is secretly backed by a real NFL player. **The player is hidden from the user.**
- Scoring may use live or historical data. Historical data is preferred for the MVP because it's free and playable year-round.
- All game rules (hero generation, schedules, scoring, league state changes) run on the server, never in the client.

## Future game modes (out of MVP scope)

These are recorded so they aren't lost. Some will use live NFL scores and show the real player attached to each hero.

| Mode | Format | Fantasy / Football | Description |
|---|---|---|---|
| Classic Crossover | Party-on-party, team-on-team | 55 / 45 | Choose fantasy players from the NFL and heroes are generated from and attached to your selected players. Your players' scores affect your heroes' stats. May the strongest party win in a 5-v-5 battle! |
| Co-op | Party-on-party, team-on-team | 40 / 60 | A shared quest runs throughout the season and parties work together to complete it while teams face off for bragging rights. |
| Free-for-all | Party-on-party, team-on-team | 50 / 50 | A shared quest runs through the season and whoever accomplishes the goal first wins the league. |
| Lone Wolf | Solo, team-on-team | 40 / 60 | An individual quest runs throughout the season and parties work separately to complete it while teams face off for bragging rights. |

Code that exists only for these modes (`Team`, `Unit`, salary cap, team builder) will be removed from the MVP
codebase during the backend rewrite and rebuilt when the modes are scheduled. It stays in git history for reference.

## Post-MVP backlog (Classic)

Deferred during the scoring spec review. Details are in [docs/CLASSIC_SCORING.md](docs/CLASSIC_SCORING.md).

- Hero attributes affect scoring (small multiplier on primary attribute)
- Live snake draft with pick timer and auto-pick fallback
- Playoff bracket (NFL weeks 15–17)
- Simulated turn-based combat (seeded RNG) as an alternative to score-based battles
- Kicker class
- "How it works" page explaining Levels, classes, and that hero strength follows a real season (main screens stay pure fantasy, with no mention of real players or the NFL)
- Mascot crest emblems (dragon, wolf, owl, etc.) as a second emblem set, alongside the 8 heraldic ones
- Inspiration: a natural 1 earns the party an Inspiration token to spend on a later battle for a small Champion
  boost (a comeback mechanic; needs a balancing simulation). Builds on natural 20s and natural 1s.
- Trades between parties: accepted trades happen immediately; no trades after week 10 (cut from the MVP on 2026-10-16)

## Future ideas

- **Dynasty leagues:** heroes carry over between seasons. This is why hero identities are never revealed.
- **Daily standings refresh:** a free scheduled trigger (for example GitHub Actions) that advances leagues even when
  nobody opens them. Leagues already advance on demand, so this only needs adding once the API is hosted.

## Before public launch

- **Google sign-in keys:** Auth0's Google connection uses shared development keys. Register the app's own Google
  OAuth client (free) and set it on the connection.
- **Production URLs:** add the hosted web address (and later the mobile app URLs) to the Auth0 application's
  callback, logout and web-origin lists, and to the API's `CORS_ORIGINS`.
- **Production database:** a separate Atlas project and free cluster, so development data never mixes with real
  players' data.
- **App stores (when shipping mobile):** Apple Developer Program ($99/year) and Google Play ($25 one-time).

