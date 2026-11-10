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

After the balancing simulation (2026-11-10) the user chose: costs of Level squared with a cap of 116, since linear
costs made one answer always right; runs need at least 8 weeks; the real season's luck is accepted; the monsters'
×1.25 / ×0.75 stay as in the other modes.

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
- **When:** from NFL week 2 to NFL week 10. The pool only holds players who have played this season, so a run's
  first week is NFL week 2 at the earliest; its week 1 is the first NFL week whose first kickoff is after the party
  is confirmed. Runs play through **NFL week 17**, as in Crossover, and need at least **8 weeks** (decided
  2026-11-10: with fewer, most monsters get a single week and one bad Sunday costs a life; such runs won about half
  the time). Later in the season, or off-season, starting is refused clearly, saying when Solo opens again.
- **Building the party:** the player picks 8 heroes from the pool under the budget, names a Champion, and confirms.
  Until confirmed nothing is played; the run starts with the next eligible NFL week.

## The budget

- **Cost = the hero's Level squared**, shown as gold: Level 1 costs 1, then 4, 9, 16, 25, 36, 49, 64, 81, and a
  Level 10 costs **100**.
- **Cap: 116 gold** for the 8. A Level 10 leaves 16 for the other seven, so the choices are one star with a cheap
  party, or five solid fighters (around Level 4–5) and a Level 1 bench.
- **Why squared** (balancing, 2026-11-10): with cost equal to Level, the best build was always the best Level 10s and
  a Level 1 bench, at every cap from 28 to 48, and even parties won 12–19% of runs against 65%. Only five heroes fight
  and the Champion's ×1.25 lands on one of them, so a star was worth more than its price. Squared costs make both
  approaches work: stars win 69%, even fighters 64%.
- **The price is locked at signing.** Levels follow the season (Crossover's ranking blends this season's points with
  last season's), so a hero's Level can change after you sign them. The cap counts what you paid, so a breakout you
  signed early stays cheap, and a slump never puts you over the cap.
- **Class limits:** at most 2 team defenses (Paladins), as in Crossover *(default)*.
- **Pool:** every current-season QB, RB, WR, TE and team defense who has played this season. Levels are deciles of
  each class by Crossover's ranking, recomputed as each week goes final. At NFL week 2 that's about 35-40
  quarterbacks, 90 running backs, 140 receivers, 70 tight ends and 32 defenses, so every Level has a few of each
  class. A six-party league-sized pool instead put only 1-6 of a class at each Level and left even parties further
  behind (46% against 65%).

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
  the later ones. A run with 14 weeks
  left gets Co-op's 3, 3, 3, 3 and 2; the shortest, 8 weeks, gets 1, 2, 2, 2 and 1. A run starting in NFL week 2
  (16 weeks) gets 3, 3, 4, 4 and 2.
- **Unchanged from Co-op:** one monster at a time, falling early banks time, overkill carries over, a missed deadline
  costs one of **3 lives** and the story moves on, the run is won when the boss falls and lost when the last life
  goes or the boss outlasts its deadline.

### HP

> HP = the best party's projected damage at the start × 1.12 × weeks in the chapter's window × difficulty factor ×
> a seeded variation of up to ±15%

- **The best party's projected damage:** when the run is confirmed, the server finds the party worth the most under
  the cap from that week's pool (the same exact search the simulation uses: five fighters and a bench of three, at
  most 2 defenses) and adds up its five fighters' projected class damage per game. It uses only what's known at the
  start, and every run that starts in the same week faces the same strength. **×1.12** turns that projection into what
  such a party actually deals, with the Champion, synergies and crits (measured on 2012-2025).
- **Why from the projection** (balancing, 2026-11-10): parties bought early in the season deal more than those bought
  mid-season (1.13 against 0.90 of average), partly because more of the pool is projected well. With one fixed weekly
  value, runs starting in NFL week 2 won 94% and those in week 7 44%; from the projection, 85% and 46%, the rest being
  how the real season goes. HP following the NFL week (bye weeks, late season) changed nothing, so there's no bye
  allowance.
- **Difficulty factors:** chapters ×1.0 and the boss ×1.0. Shorter boss windows (1-2 weeks) already make it the
  hardest fight.
- Shown HP is rounded up, as in Co-op.

## Balancing (decided 2026-11-10)

Simulated with `npm run simulate:solo` (api/src/scripts/simulate-solo.ts) on the real 2012–2025 seasons, as if each
were the current one: the pool, Levels and traits rebuilt week by week with Crossover's ranking; parties bought with
an exact search under the cap; Crossover's Quest damage (class damage, natural 20s and 1s, the monster's weaknesses,
Champion, synergies); and the engine's own campaign code. 756 parties (every season, start week and plan), each played
against 8 seeded campaigns. A player with no stat line is taken to be known as resting before kickoff, and kickoff
order isn't simulated.

| Plan (Level² costs, cap 116, boss ×1.0) | Win | Lives lost 0 / 1 / 2 / 3 |
|---|---|---|
| **Sensible**: the best party by projection, the top five fight, swaps cover byes (the target) | **68%** | 34% / 21% / 15% / 29% |
| Planner: party and Champion set against each monster | 69% | 36% / 21% / 15% / 28% |
| Stars: the two best Level 10s, then the best value | 69% | 40% / 20% / 12% / 28% |
| Even: fighters within a Level of their average | 64% | 26% / 22% / 20% / 32% |
| Churn: both swaps every week chase the best value | 68% | 35% / 21% / 15% / 30% |
| Sensible, never a Champion | 43% | 14% / 17% / 19% / 51% |

- **Stars and even parties** land within 5 points, so building is a real choice.
- **Swaps can't buy a run:** chasing value every week wins no more than covering byes (sensible parties use about
  half a swap a week, churn almost one).
- **The Champion matters:** never naming one loses most runs.
- **Planning for the monster** adds about a point. Eight heroes with a cheap bench leave few choices, so the
  weaknesses are a nudge, as the user accepted, keeping ×1.25 / ×0.75 for every mode.
- **The real season decides a lot:** sensible parties won 15% of runs in 2020 and 86-88% in 2013, 2018 and 2022.
  Scaling HP to how the season was scoring so far didn't help (the misses are projections, not scoring levels), so
  this is accepted as part of playing the real NFL, and How it works says so.
- **Start weeks:** 85% from NFL week 2, 46-81% from weeks 3-10. Early runs have longer windows, which smooth out a bad
  week.
- **Rejected:** linear costs (one build always right), Level^1.5 costs (stars ahead by about 19 points), a
  league-sized pool, HP by NFL week, and HP scaled to the season so far.

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

Solo gets its own ruleset version (roster of 8, Quest party of 5, 2 swaps a week, at most 2 defenses, the cost
table 1-100, a cap of 116, 8 weeks to start, the projection scale 1.12, chapter and boss factors 1.0, ±15%
variation), so later tuning never changes running campaigns.

**Launch switch:** Solo runs can be started only when the API's `SOLO_ENABLED` setting is `true`, off in production
until every build phase is done.

## Build phases

1. **Spec review** (this document): done 2026-11-09.
2. **Balancing simulation:** the cap, costs, HP and difficulty factors, on real seasons: done 2026-11-10.
3. **API:** the `solo` mode, the pool with costs, building and confirming a party, swaps and locks, the scaled
   campaign, finale; tests on both sides of the visible-player line.
4. **App:** start a run, build your party, the quest board, party and swaps, finale, How it works.

Each phase is its own branch and pull request.
