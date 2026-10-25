# Crossover Mode Spec

> Status: **draft for review** (2026-10-24). Working name "Crossover" (ROADMAP.md's "Classic Crossover", reshaped
> to 50/50). Items marked *(default)* are proposals to confirm or change in review.

## Goals

1. **Nerds and jocks play together.** Half of every matchup is pure fantasy football, half is D&D.
2. **Real players, shown openly.** Unlike Classic, every hero is a visible, current NFL player.
3. **Game-day scores on a $0 budget.** Scores fill in as games finish, from free, licensed nflverse data.
4. **Reuse Classic's engine.** Draft, classes, traits, Champion, synergies, natural 20s, monsters, free agency and
   chat carry over; Crossover adds positions, kickoff locks, encounters and a second scoreboard.

Decided with the user on 2026-10-24: game-day scores via nflverse, two scoreboards, a ranked draft of real players,
current NFL season only, encounter modifiers for the Quest, each board counts as a win, football-position lineups,
and each player locking at kickoff.

## How it differs from Classic

| | Classic | Crossover |
|---|---|---|
| Players | Hidden, a random past season | Visible, the current NFL season |
| Calendar | Host's cadence (daily or weekly) | Real NFL weeks only |
| Lineup | 5 open slots, roster of 10 | QB, 2 RB, 2 WR, TE, FLEX, DEF; roster of 14 |
| Lock | Whole lineup when the week resolves | Each player at their game's kickoff |
| Result | One battle | Two boards: Gridiron and Quest |
| Natural 20s | Flavor only | Count in the Quest |

A league's mode is chosen when it's created and never changes. Classic's hidden-player rule is untouched: player
identity is only ever serialized for Crossover leagues, with tests on both sides of that line.

## Data and scores

- **Source:** nflverse `stats_player_week_2026`, `stats_team_week_2026` and `schedules/games.csv` (CC-BY-4.0), the
  same files Classic imports. nflverse updates nightly after game days and at set points on game days; corrections
  land by Wednesday.
- **Automatic import:** a scheduled GitHub Actions workflow (free) re-imports the current season nightly, and every
  hour from Thursday 8 PM to Tuesday 6 AM Eastern during the season *(default)*. It needs the production database
  address stored as a GitHub Actions secret, which the repository owner adds. The importer already updates rows in
  place, so repeated runs are safe.
- **What we never use:** the schedule file's betting columns (spreads, moneylines, totals). They aren't imported.
- **Game-day scores:** during a week, the matchup shows provisional totals from games already imported, labeled
  "4 of 7 games final". A player whose game hasn't been imported shows their projection instead, marked as such.
- **Final:** a week goes final at the first import after Tuesday 6 AM Eastern that has stats for every game that week
  *(default)*. If the data is late, the week waits and the screen says so. Results don't change after going final, even
  if the NFL corrects a stat later *(default; real apps differ, but stable results avoid disputes)*.

## Calendar

- A Crossover league can be created any time during the NFL regular season. The host schedules the draft; week 1 of
  the league is the first NFL week whose first kickoff is after the draft.
- The league plays through **NFL week 17** *(default)*, so week 18's resting starters don't decide titles. Leagues
  need at least **4 weeks** left at draft time *(default)*; late in the season, creating one is refused clearly.
- Playoffs are post-MVP, as in Classic.
- Off-season, Crossover is unavailable and the create screen points to Classic.

## Pool and draft

- **Pool:** current-season QB, RB, WR, TE and team defenses who have played this season. Sized like Classic,
  about 2.3× demand, scaled to 14-hero rosters: per party 5 QB, 9 RB, 10 WR, 5 TE and 3 DEF, and at least 21 heroes
  per party overall. Real 2026 data fills every league size (12 parties: 376 heroes for 252 needed).
- **Ranking (changed 2026-10-24 after a real-data check):** this season's points blended with a prior worth 3 games,
  the same blend as projections: last season's points per game if they played 4+ games, otherwise what a Level 1
  hero of their class scores. The first proposal (this season's average after 2 games) let one-game flukes reach
  Level 10, e.g. a backup tight end with a single 14.5-point game; with the blend he's a Level 6, and the top of each
  position matches real fantasy rankings (Allen, Gibbs, Bijan, Smith-Njigba, Nacua, Bowers, McBride).
- **Heroes:** each player becomes a hero with a generated hero name, class (QB Mage, RB Warrior, WR Ranger, TE Rogue,
  DEF Paladin), race and look, shown with the player's name, team and position. Level 1–10 is the player's decile
  within the pool, by the same ranking. Traits (Steadfast, Wild, Mighty) come from the previous season's weekly
  points, as in Classic; players without a previous season have none.
- **Draft:** the same automatic, ranked snake draft. Members rank players beforehand; the draft runs at the scheduled
  time. Class limits apply (at most 2 team defenses *(default)*). A live draft is post-MVP.
- **Free agency:** as in Classic, claim by dropping, first come, first served. Kickoff locks apply: a starter whose
  game has kicked off can't be dropped until the week ends. When a dropped starter's slot needs filling, the claimed
  player takes it if their game hasn't started; otherwise the best bench player yet to play steps in, and if nobody
  can, the claim is refused. So a player never counts for a week they weren't on the roster at kickoff.

## Lineup and locks

- **Starters (8):** QB, RB, RB, WR, WR, TE, FLEX (RB, WR or TE), DEF. **Bench: 6.** Roster of 14.
- **Locks:** each starter and bench player locks at their game's kickoff (from the schedule's date and Eastern time).
  Locks cover the Quest party too.
  Until then they can be moved freely. A locked player can't be moved in or out of the lineup, and the Champion can't
  be changed to or from a locked player.
- **Byes and inactives:** a player on bye shows **Resting**. No auto-swap in Crossover *(default)*: with per-player
  locks, managers can make their own swaps, as in real fantasy apps.

## The two scoreboards

Every matchup has two results, and **each board is a win**: a sweep goes 2–0, a split 1–1. Standings rank by board
wins (a draw is ½), then by total Gridiron points.

### Gridiron (the football half)

The sum of the 8 starters' fantasy points under the ruleset's base points (Classic's half-PPR table and team defense
table). No class multipliers, no Champion, no synergies: plain fantasy football.

### Quest (the D&D half)

Each week the league faces an **encounter**: a monster with strengths and weaknesses. The ten encounters come up in an
order shuffled from the league seed, all ten before any repeats, and each week's is shown ahead of time so parties can
plan for it. Together they cover every pair of classes once as weaknesses and resist each class twice, so no class is
favored over a season.

The Quest is fought by a **Quest party of 5 heroes** (decided 2026-10-24): any class, picked from the whole roster,
football starters and bench alike. The football lineup scores Gridiron; the Quest party scores the Quest. The jock can
run one, the nerd the other. After the draft each party's highest-Level heroes form its first Quest party. Kickoff locks
apply: a player whose game has started can't join or leave the party (or be dropped) until the week ends.

A Quest party member's damage is:

> class damage (points × class multiplier, as in Classic) × natural 20 or 1 × encounter modifier, then Champion and synergies

- **Encounter modifiers:** weak to two classes ×1.25, resists one ×0.75.
- **Natural 20s and 1s count here:** a natural 20 is +25% and a natural 1 deals nothing. Same top/bottom 5% thresholds as
  Classic, by class.
- **The Champion leads the Quest party:** they must be in it (the football lineup doesn't affect them), and leaving them
  out withdraws them. Mighty Champion, Order & Chaos and Bulwark work as in Classic, among the Quest party.
- **Odd number of parties:** the spare party fights the week's encounter on both boards; its scores are that week's
  league averages (as Classic's dungeon monster).

**Balancing (2026-10-24).** Simulated on the real 2013–2025 seasons: six-party leagues, 4 seeds each, 2,652 matchups per
variant, each party following one plan through the real draft. The target was Gridiron and Quest disagreeing in at least
30% of matchups, so the D&D half really decides results, with no plan running away.

| Variant | Boards split | Encounter-aware plan | No Champion (Quest) |
| --- | --- | --- | --- |
| One lineup for both boards, ×1.25 / ×0.75 (the first proposal) | 13% | 55% overall | 44% |
| One lineup, ×2 / ×0.5 | 19% | 56% overall | 43% |
| One lineup, plus a random roll on each hero | 14.5% | 54% overall | 44% |
| **Separate Quest party, ×1.25 / ×0.75 (chosen)** | **29%** | **55% overall, 55% of Quests** | **41%** |
| Separate Quest party, ×1.5 / ×0.5 | 31% | 58% overall, 62% of Quests | 38% |

With one shared lineup both boards come from the same players' points, so they almost always agree. A separate Quest
party splits results about as often as the target, rewards planning for the encounter, and keeps every plan between
45% and 55%. Larger modifiers made encounter-aware play too strong.

## What users see

- **Matchup:** two scoreboards side by side, each starter showing their football points and Quest damage, the
  encounter card, kickoff times and lock icons, and "N of M games final" while the week is live.
- **Player cards:** real name, team and position, plus the hero: class, Level, traits. No player photos *(default)*:
  nflverse links to NFL headshots, and we don't have rights to show them.
- **How it works:** a Crossover section explaining both boards and encounters.
- **Attribution:** "Stats data provided by nflverse", as today.

## Ruleset

Crossover gets its own ruleset version (lineup slots, roster size, encounter values, natural-20 effects, season
weeks), so later tuning never changes running leagues.

**Launch switch:** Crossover leagues can be created only when the API's `CROSSOVER_ENABLED` setting is `true`. It
stays off in production until every build phase is done, so the ruleset (version 2) can still change before any real
league uses it.

## Build phases

1. **Data:** current-season auto-import (GitHub Actions), schedule kickoff times, league `mode`.
2. **Pool and draft:** current-season pool, visible players, positional slots, 14-hero rosters.
3. **Calendar and locks:** NFL-week schedule, per-player kickoff locks, game-day provisional scores, finalizing.
4. **Boards:** Gridiron and Quest scoring, encounters, standings by board wins; balancing simulation.
5. **App:** mode picker on league creation, player cards, two-board matchup, How it works.

Each phase is its own branch and pull request, tested like Classic.
