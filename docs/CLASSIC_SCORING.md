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
| Fumble recovery TD (recovering a fumble in the end zone) | 6 |

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
- **No reveal, ever:** a hero's real player or team and the hidden season stay hidden, even after the league ends.
  This keeps dynasty-style leagues possible, where heroes carry over between seasons (decided 2026-10-13).

## Step 6: League calendar

- Regular season: NFL weeks 1–14 for matchups. **Standings only** for the MVP: best record wins, with total
  damage as the tiebreaker. A playoff bracket (weeks 15–17) is post-MVP.
- **The host picks the cadence** when creating the league (e.g., daily or weekly). A scheduled server job resolves
  each game week on time; historical leagues don't follow the real NFL calendar.

## Party and draft

- **Roster of 10** (raised from 8 on 2026-10-13 so auto-swap has more cover).
- **Open lineup** (decided 2026-10-13): **5 starting slots, any class**, and 5 on the bench. Classic is for fantasy
  fans first, so class choice is strategy, not a football position chart.
- **Class multipliers** balance the classes: a hero's damage is its points times its class multiplier.
  **Mage ×1.0, Warrior ×1.45, Ranger ×1.4, Rogue ×2.05, Paladin ×2.35.** These were calibrated on the 2012–2025 pools
  so that a hero's Level means similar damage in every class (Level 6–8 heroes average about 17–18 damage per game
  in each). Class identity is deliberate: **Mages are steady, while Rogues and Paladins are boom-or-bust** (about twice
  the week-to-week swing). Elite Rogues are the strongest heroes, and a Paladin's Level predicts the least.
- Lineup shape, multipliers and pool sizes are ruleset data, so future modes (e.g. football-position crossovers
  with multipliers of 1.0) reuse the same engine.
- **Balance check** (2012–2025 real data, 3 seeds each, 6-party leagues, unmanaged lineups with auto-swap): win rates by
  draft strategy were best-Level 54.9%, stack Rogues 53.1%, Warriors 50.7%, Rangers 49.5%, Mages 47.1% and
  Paladins 44.7%. Starting slots split 17–23% per class. No single-class stack dominates, and drafting by Level,
  the signal the game shows players, is the best approach.

- **Automatic snake draft:** each participant ranks the hero pool ahead of time; at the scheduled draft time the
  server runs the snake order (randomized) and picks the highest-ranked available hero for each turn. Anyone who
  didn't submit a ranking gets picks by Level. Live drafting is post-MVP.

## League setup

Decided 2026-10-12:

- **Party per league:** hosting or joining a league creates the user's party for that league
  (name + **crest**: one of 8 emblems on one of 6 banner colors, decided 2026-10-14). One party per user per league;
  parties don't exist outside leagues.
- **Size:** the host picks a maximum of 2–6 parties.
- **Visibility:** private leagues are joined by PIN only. Public leagues also appear in a search list.
- **Starting:** no ready flags. Once 2 or more parties have joined, the host schedules the draft, and members rank heroes before it runs.
- **Leaving:** while a league is forming, members can leave and the host can remove members.
  The host cancels the league instead of leaving it.

## Season setup and draft (step 4a)

Decided 2026-10-12. Items marked *(default)* were filled in during implementation; change them in review if needed.

**Scheduling the draft.** Once 2 or more parties have joined, the host picks a draft time, between 10 minutes and
14 days ahead *(default)*. Scheduling **locks membership** (status `drafting`), because the hero pool is sized to the
parties. The host can reschedule until the draft runs.

**Hidden season.** When the draft is scheduled, the server picks a random season from 2012–2025, out of those whose
stats (and the previous season's) are imported. It is never sent to clients.

**Hero pool** (about 2.3× demand). Each party drafts 10 heroes, so the pool per party is
4 Mages (QB), 6 Warriors (RB), 6 Rangers (WR), 4 Rogues (TE) and 3 Paladins (DEF), 23 in all *(default)*.
Only players with at least one game in weeks 1–14 of the hidden season are eligible.

- **Veterans** (4 or more games in the previous season) are ranked by previous-season points per game under the
  league's ruleset. The best fill the pool.
- **Mystery recruits** are rookies drafted in the hidden season's NFL draft, taking up to 20% of each class's pool
  *(default)*, best draft picks first. Their exact Level is hidden; they show a **Level range** by draft round,
  calibrated on 2012–2025 data (decided 2026-10-13): **round 1 → 1–4, round 2 → 1–2, round 3+ → 1**. First-round
  rookies played like Level 1–2 veterans on average, with real upside; later rounds played below that.
- Veterans with fewer than 4 games in the previous season are left out of the MVP pool *(default)*.

**Level (1–10).** Within each class in the pool, veterans are split into deciles by previous-season points per game:
the top 10% are Level 10. Team defenses (Paladins) work the same way, using team defense points per game.

**Hero appearance** (from the original generator):

| Class | Races (50/50) | Weapon | Skill | Male share |
|---|---|---|---|---|
| Mage | Gnome, Elf | Staff | Fireball | ~2/3 |
| Ranger | Human, Elf | Bow | Power Shot | ~2/3 |
| Warrior | Half-orc, Dwarf | Sword and Shield | Shield Bash | ~3/4 |
| Rogue | Human, Halfling | Dagger | Sneak | ~2/3 |
| Paladin | Dragonborn, Aarakocra | Spear | Minor Self-heal | ~3/4 |

Attack, defense and magic are the class base plus a 1–3 roll, as in the original generator (cosmetic only).
Names are generated from name parts and are unique within a league. All randomness comes from a seeded generator
stored on the league, so a league's setup can be reproduced and audited.

**Rankings.** Before the draft, each member may rank any part of the pool.

**The automatic snake draft.** At the draft time (processed when anyone opens the league), the snake order is
randomized. Each pick takes the picker's highest-ranked available hero that keeps their roster completable. If none of
their ranked heroes is still available and allowed, it takes the highest-Level allowed hero (a mystery recruit counts
as the midpoint of its range). A pick is not allowed if it would leave the roster unable to fill its required slots, or
if it would take the last hero of a class that another party still needs.

**After the draft** the league becomes `active`. Each party's starting lineup is auto-filled with its highest-Level
heroes (restrictive slots first, when a ruleset has any). Week 1 resolves one cadence after the draft time.

## Season play (step 4b)

Decided 2026-10-13. Items marked *(default)* were filled in during implementation.

- **Schedule:** a round-robin over game weeks 1–14 (the hidden season's NFL weeks 1–14), generated when the draft runs.
  The party order is shuffled from the league seed; with 2 parties they meet every week.
- **Dungeon monster:** with an odd number of parties, the party without an opponent each week fights a monster.
  The monster's damage is that week's league-average party damage. Wins, losses and draws against it count in the standings.
- **Timing:** game week *k* resolves at `weekOneAt + (k − 1) × cadence`. It is processed the first time anyone opens the
  league after that time. If several weeks are due at once, they resolve in order.
- **Lineup lock:** the lineup in place when a week resolves is used. Any lineup change first resolves every week already
  due, so a late change only affects later weeks. Each week's result stores the lineup that was used.
- **Resting:** a hero whose player or team has no stats that NFL week is shown as **Resting** for the upcoming week and scores 0.
- **Auto-swap** (decided 2026-10-13; on by default, each party can turn it off): when a starter is Resting at resolve
  time, the highest-Level bench hero who isn't resting and is eligible for that slot takes the slot and scores
  **50% of its points**. Required slots are filled before FLEX, and each bench hero can swap in once. Auto-swap
  chooses by Level, not by that week's actual points, so it never uses information a manager wouldn't have.
- **What users see:** party totals are exact. Each hero's damage is shown **rounded to the nearest whole number**,
  because exact per-hero weekly points could be matched against public stats to identify the hidden player.
  Scoring itself always uses exact values.
- **Standings:** a win is worth 1 and a draw ½ *(default)*. Ties in the standings go to the higher total damage. After
  week 14 the league is `complete`.

## Attribution

nflverse data is CC-BY-4.0. The app needs a visible credit, e.g., "Stats data provided by nflverse" on the About page.
