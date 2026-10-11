# Classic Mode Scoring Spec

> Status: **approved for MVP** (2026-10-10). Changes after implementation require a new ruleset version.

## Goals

1. **Football decides the outcome.** A hero's weekly power comes from its hidden NFL player's real stats.
2. **Drafting takes skill, not just luck.** Players are hidden, so heroes still need to tell you how good they are.
3. **No outside lookups.** Users must not be able to work out the player or season and look up results.
4. **Deterministic and auditable.** The same stats always give the same result, all computed on the server.
5. **Free data.** Everything comes from nflverse (CC-BY-4.0, attribution required).

## Data source

[nflverse-data](https://github.com/nflverse/nflverse-data) publishes weekly CSVs for 1999 through the current season:

| Release | Used for |
|---|---|
| `stats_player/stats_player_week_YYYY.csv` | QB / RB / WR / TE weekly stats |
| `stats_team/stats_team_week_YYYY.csv` | Team defense (sacks, INTs, fumble recoveries, def TDs, safeties, blocks) |
| `schedules` | Points allowed (final scores), bye weeks |

Offensive rows from 2000 to 2026 take about 31 MB raw, which fits easily in the Atlas M0 free tier (512 MB).
An import script loads them into our own `PlayerWeekStats` collection. The game never calls an outside API at runtime.

## Step 1: Base points (our own ruleset)

We compute points ourselves instead of using nflverse's `fantasy_points` column, so we control the rules.
Rulesets are **versioned**: each league stores the ruleset version it started with, so later tuning
never changes past results.

Ruleset v1 (half-PPR):

| Stat | Points |
|---|---|
| Passing yard | 0.04 (1 per 25) |
| Passing TD | 4 |
| Interception thrown | −2 |
| Rushing / receiving yard | 0.1 (1 per 10) |
| Rushing / receiving TD | 6 |
| Reception | 0.5 |
| 2-pt conversion (pass, rush, rec) | 2 |
| Fumble lost | −2 |
| Special teams TD | 6 |

**Team defense (Paladin):**

| Stat | Points |
|---|---|
| Sack | 1 |
| Interception / fumble recovery | 2 |
| Defensive or return TD | 6 |
| Safety / blocked kick | 2 |
| Points allowed: 0 / 1–6 / 7–13 / 14–20 / 21–27 / 28–34 / 35+ | 10 / 7 / 4 / 1 / 0 / −1 / −4 |

Sanity check against real data: Christian McCaffrey, 2023 week 1 (152 rush yds, 1 TD, 3 rec for 17 yds) scores
15.2 + 6 + 1.5 + 1.7 = **24.4**.
## Step 2: Class mapping (from the existing hero generator)

| Position | Class | Weapon | Primary attribute |
|---|---|---|---|
| QB | Mage | Staff | Magic |
| RB | Warrior | Sword and Shield | Attack |
| WR | Ranger | Bow | Attack |
| TE | Rogue | Dagger | Attack |
| Team DEF | Paladin | Spear | Defense |

Kickers are out of scope for the MVP.

## Step 3: Hero ratings give drafting signal without revealing the player

Today hero attributes are random (+1 to +3), so they tell the drafter nothing. Proposal: derive each hero's
**Level (1–10)** from its player's percentile among that position's players **in the season before** the league's
season, the same way real drafts use last year's performance. Rookies get a level from their draft round.

- The Level is the main drafting signal, like a rank or projection.
- Attack, defense and magic stay mostly cosmetic, with a small tie-in to the profile: e.g., a QB with high rushing volume
  gets extra Attack. This adds D&D flavor without changing the math much.

**Decided:** attributes are **cosmetic only** in the MVP. Revisit post-MVP: a small multiplier (e.g., primary
attribute ±5%) so heroes with the same Level differ slightly.

## Step 4: Weekly faceoff resolution

**MVP: Score-based battle**
- Each party fields its active lineup. Party damage = sum of active heroes' base points.
- The higher damage wins the faceoff. Tiebreakers: (1) highest single hero, (2) bench total, (3) draw.
- The UI shows it as a battle ("Your Mage cast Fireball for 24.4 damage"), but the result is plain math.

**Future option: Simulated combat.** Points become HP and damage in a turn-based battle with a seeded RNG.
This is more D&D-like but harder to balance and to explain. It's a good fit for Co-op and quest modes later.

## Step 5: Keeping it hidden and fair

- **Each league's season is hidden too.** It's picked at random server-side when the league activates
  (for example, from 2012 onward). Otherwise users could look up results.
- The API **never sends** the player's identity or season to the client during an active league. Today's code
  populates the full player on hero documents, and that must stop.
- **Bye weeks and inactives:** a hero with no stats row that week is shown as **"Resting"** before lock,
  just as real fantasy apps show byes and inactive players. Resting heroes score 0.
- **Reveal:** once the league ends, show which NFL player was behind each hero as a payoff moment.

## Step 6: League calendar

- Regular season: NFL weeks 1–14 for matchups. **Standings only** for the MVP: best record wins, with total
  damage as the tiebreaker. A playoff bracket (weeks 15–17) is post-MVP.
- **The host picks the cadence** when creating the league (e.g., daily or weekly). A scheduled server job resolves
  each game week on time; historical leagues don't follow the real NFL calendar.

## Party and draft

- **Roster of 8:** 6 active slots (Mage, Warrior, Ranger, Rogue, Paladin, plus **FLEX** = Warrior, Ranger or Rogue)
  and 2 on the bench. Lineups lock before each game week resolves.

- **Automatic snake draft:** each participant ranks the hero pool ahead of time; at the scheduled draft time the
  server runs the snake order (randomized) and picks the highest-ranked available hero for each turn. Anyone who
  didn't submit a ranking gets picks by Level. Live drafting is post-MVP.

## Attribution

nflverse data is CC-BY-4.0. The app needs a visible credit, e.g., "Stats data provided by nflverse" on the About page.
