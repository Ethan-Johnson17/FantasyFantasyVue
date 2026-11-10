# Solo mode

A one-player way to play: a single party of heroes built from real, current-season NFL players, against a campaign
of monsters. It takes Crossover's players and Quest board and Co-op's campaign, with no other parties.

## Goals

1. **Play alone, any time in the NFL season.** No friends to gather, no draft to schedule.
2. **Real players, D&D results.** Heroes are visible NFL players, as in Crossover; only the Quest half is played.
3. **Reuse what's built.** Crossover's pool, heroes, kickoff locks, game-day scores and Quest damage, and Co-op's
   campaign rules, chapters, lives and quest board.
4. **Choices that matter.** A budget makes building the party a trade-off, and limited swaps keep each week's
   plan from being bought.

Decided with the user on 2026-11-09: based on Crossover; the goal is Co-op's campaign for one party; heroes are bought
under a budget, with no draft or bots; a roster of 8, 5 of whom fight; up to 2 swaps a week; the campaign scales to
the weeks left; private for now; one run at a time per account; cost equals Level, with the cap balanced by
simulation so a sensible build wins about 2 in 3 campaigns.

## How it differs from Crossover

| | Crossover | Solo |
|---|---|---|
| Opponents | Other parties, head-to-head | None: a campaign of monsters |
| Getting heroes | Ranked snake draft | Buy heroes under a budget |
| Roster | 14, an 8-player football lineup and a Quest party of 5 | 8: a Quest party of 5 and a bench of 3 |
| Boards | Gridiron and Quest | Quest only |
| Moves | Free agency, first come first served | Up to 2 swaps a week, from the whole pool |
| Result | Standings, optional playoffs | The campaign is won or lost |
| Social | League, PIN, chat | Private: no PIN, chat or public listing |

Unchanged from Crossover: visible players and generated heroes, classes by position, Levels and traits, kickoff
locks, byes shown as Resting with no auto-swap, game-day provisional scores, weeks going final on Tuesday,
natural 20s and 1s, the Champion leading the Quest party, synergies, and attribution to nflverse.

## Starting a run

- **One run at a time per account.** Starting needs no other run in progress. Once a run is won or lost, a new one can
  start if enough of the season is left. Abandoning a run counts as a loss *(default)*.
- **When:** any time during the NFL regular season. The run's week 1 is the first NFL week whose first kickoff is
  after the party is confirmed. Runs play through **NFL week 17**, as in Crossover, and need at least **5 weeks** left
  so each monster gets at least one *(default)*. Late in the season, or off-season, starting is refused clearly.
- **Building the party:** the player picks 8 heroes from the pool under the budget, names a Champion, and confirms.
  Until confirmed nothing is played; the run starts with the next eligible NFL week.

## The budget

- **Cost = the hero's Level** (1–10).
- **Cap:** set by the balancing simulation, starting around **48** for 8 heroes (an average Level of 6). Two
  Level 10s mean a thin bench; an even Level 6 party has no stars.
- **The price is locked at signing.** Levels follow the season (Crossover's ranking blends this season's points with
  last season's), so a hero's Level can change after you sign them. The cap counts what you paid, so a breakout you
  signed early stays cheap, and a slump never puts you over the cap.
- **Class limits:** at most 2 team defenses (Paladins), as in Crossover *(default)*.
- **Pool:** every current-season QB, RB, WR, TE and team defense who has played this season. Levels are deciles of
  the pool by Crossover's ranking, recomputed as each week goes final *(default; the simulation checks that deciles of
  the whole pool, not a league-sized one, keep a sensible spread of costs)*.

## Lineup, swaps and locks

- **Quest party of 5**, any class, from the 8, plus a **bench of 3**. The Champion must be in the party, as in
  Crossover.
- **Swaps: up to 2 per NFL week.** A swap releases one hero and signs any other hero from the pool, as long as the
  party stays under the cap at signing prices. Unused swaps don't carry over *(default)*. A week's swaps reset when it
  goes final.
- **Locks:** each hero locks at their game's kickoff, as in Crossover. A locked hero can't join or leave the Quest
  party, be released, or be signed, and the Champion can't change to or from a locked hero.
- **Byes:** a hero on bye shows Resting and deals nothing; there's no auto-swap, so the bench and swaps are how a
  player covers byes and injuries.

## The campaign

Co-op's campaign (docs/COOP_SPEC.md), for one party:

- **Five monsters:** four chapters drawn from Crossover's ten encounters in an order shuffled from the run's seed,
  then the boss raid against **The Dragon Tyrant**. Each is weak to two classes ×1.25 and resists one ×0.75, and is
  shown ahead of time.
- **Deadlines scale to the weeks left.** With *W* weeks from the run's week 1 to NFL week 17, the boss raid gets
  `round(W / 7)` weeks (at least 1) and the other weeks are shared among the four chapters, any spare weeks going to
  the later ones. A run starting in NFL week 1 (17 weeks) gets windows of 3, 4, 4, 4 and 2 weeks; one with 14 weeks
  left gets Co-op's 3, 3, 3, 3 and 2; one with 5 weeks left gets a week per monster.
- **Unchanged from Co-op:** one monster at a time, falling early banks time, overkill carries over, a missed deadline
  costs one of **3 lives** and the story moves on, the run is won when the boss falls and lost when the last life
  goes or the boss outlasts its deadline.

### HP

> HP = expected party damage per week × weeks in the chapter's window × difficulty factor × a seeded variation of up
> to ±15%

- **Expected party damage per week:** what a party built at the cap deals in a typical NFL week, set by the
  simulation. There's no hidden season to scale for: every run faces the real current season.
- **Bye weeks:** the expected damage may be lowered for the weeks with the most byes, if the simulation shows they
  decide runs *(to be checked)*.
- **Difficulty factors:** chapters ×1.0, the boss ×1.25, as in Co-op, retuned if the simulation says so.
- Shown HP is rounded up, as in Co-op.

## Balancing (build phase 2)

Simulate on the real 2013–2025 seasons, as if each was the current season (Levels from the blend, kickoff order
ignored), for runs starting in every NFL week with at least 5 weeks left, several seeds each:

- **Plans:** a **sensible build** (best value under the cap by Level, the highest-Level 5 fight, the top hero as
  Champion, swaps covering byes); a **planner** (sets the party and Champion against each monster's weaknesses); a
  **star build** (two or three Level 10s and a cheap bench); and **no Champion**.
- **Targets:** the sensible build wins about **2 in 3** runs, as in Co-op; the planner wins more but not every run;
  never naming a Champion loses most runs; the star build and an even build land within about 10 points of each
  other, so neither is the one right answer; the start week doesn't decide the result.
- **Tunes:** the cap, expected damage per week, the boss factor, and whether byes need an allowance.

## What users see

- **Start a Solo run** from the leagues list, shown once the API says Solo is available.
- **Build your party:** the pool with names, teams, positions, hero classes, Levels and costs, sorting and
  filters by position and class, the budget left, and the five monsters ahead with their weaknesses.
- **The quest board:** Co-op's board for one party: the monster, HP, deadline, lives, this week's damage, kickoff
  locks and "N of M games final" while the week is live.
- **Party:** the Quest party, bench, Champion and swaps left this week.
- **Finale:** victory or defeat, every chapter, and the run's best moments (biggest week, the hero who dealt the most,
  natural 20s).
- **How it works:** a Solo section.
- **My leagues:** the run as a card, like a league, with the current monster and lives.

## Out of scope for now

- Leaderboards and shared runs (everyone who starts the same week facing the same monsters).
- Several runs at once, and Classic-based Solo with hidden past-season players.
- A Gridiron board or football lineup.
- Bots, trades and drafts.

## Ruleset

Solo gets its own ruleset version (roster of 8, Quest party of 5, swaps per week, cap, cost table, HP inputs,
difficulty factors), so later tuning never changes running campaigns.

**Launch switch:** Solo runs can be started only when the API's `SOLO_ENABLED` setting is `true`, off in production
until every build phase is done.

## Build phases

1. **Spec review** (this document).
2. **Balancing simulation:** the cap, expected damage, difficulty factors and bye allowance, on real seasons.
3. **API:** the `solo` mode, the pool with costs, building and confirming a party, swaps and locks, the scaled
   campaign, finale; tests on both sides of the visible-player line.
4. **App:** start a run, build your party, the quest board, party and swaps, finale, How it works.

Each phase is its own branch and pull request.
