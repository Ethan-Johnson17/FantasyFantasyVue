# Co-op Mode Spec

> Status: **decided** (2026-11-09). The shape below is agreed; HP and difficulty values come from the balancing simulation.

## Goals

1. **Everyone on the same side.** There are no matchups between parties: every party fights the same monsters, and
   the league wins or loses together.
2. **A season-long story.** A campaign of chapters, each a monster to bring down before its deadline, ending in a boss.
3. **Reuse Classic's engine.** Hidden players, the host's cadence, the draft, classes, traits, Champion, synergies,
   natural 20s, auto-swap, free agency and chat all carry over unchanged.

Decided with the user on 2026-11-09: built on Classic; a chapter campaign; no head-to-head at all, every party's active
heroes deal their damage to the boss; three lives; about two in three leagues should win; the final chapter is a boss
raid, with no playoffs. The user then accepted the proposed defaults: deadlines at weeks 3, 6, 9, 12 and 14, early
kills banking time, overkill carrying over, a loss ending the league, Crossover's class modifiers, the eleventh boss
monster and the finale awards. Parties are listed by damage: some competition between parties is welcome, as long as
no party plays against another.

## How it differs from Classic

| | Classic | Co-op |
|---|---|---|
| Opponent | Another party each week (round-robin) | The league's current chapter monster, shared by every party |
| Result | Wins, losses, standings, playoffs | The campaign: won or lost by the whole league |
| Season | 14 weeks, plus playoffs if on | 14 weeks, no playoffs |
| Lineup | 5 starters, any class | The same |
| Damage | Class multipliers, Champion, synergies | The same, then the monster's class weaknesses |

Players stay hidden exactly as in Classic: a hero's real player, team and the league's season are never sent to the
client. A league's mode is chosen when it's created and never changes.

## The campaign

### Chapters

Five chapters over the 14 game weeks. Each has a **deadline**, the last game week by which its monster must fall:

| Chapter | Deadline | Weeks if each starts on time |
|---|---|---|
| 1 | Week 3 | 1–3 |
| 2 | Week 6 | 4–6 |
| 3 | Week 9 | 7–9 |
| 4 | Week 12 | 10–12 |
| 5: the boss raid | Week 14 | 13–14 |

- **Only one monster at a time.** The league fights the current chapter's monster until it falls or its deadline passes.
- **Falling early banks time.** When a monster falls before its deadline, the next chapter starts the next week, while
  its deadline stays where it was. A strong start gives later chapters more weeks.
- **Overkill carries over**: damage beyond a monster's remaining HP in the week it falls is dealt to the next
  chapter's monster, so a big week is never wasted.
- **Missing a deadline costs a life**: the league loses one of its **3 lives**, the chapter is marked failed,
  and the story moves on to the next chapter, which starts the following week.
- **Win:** the boss falls by week 14 with at least one life left. **Lose:** the third life is lost, or the boss is still
  standing after week 14.
- **After a loss**: the league is complete at once, and the finale shows how far the league got. With no
  matchups there is nothing else left to play.

### Monsters

- Each chapter's monster has **HP** and the class strengths and weaknesses of Crossover's encounters: **weak to two
  classes ×1.25, resists one ×0.75**, so planning helps without dominating.
- Chapters 1–4 draw four of Crossover's ten encounters, in an order shuffled from the league seed. The boss is a fifth,
  stronger monster: an eleventh named monster, weak to two classes and resisting one, its weaknesses also chosen from
  the seed.
- Every monster is shown ahead of time, so parties can plan lineups and their Champion for it.

### Damage

A party's damage each week is its Classic battle damage, with the monster's modifiers applied per hero:

> class damage (points × class multiplier) × weakness or resistance, then Champion and synergies, summed over the
> active heroes (auto-swapped heroes at 50%, as in Classic)

All parties' damage is added together and dealt to the monster. Resting heroes deal nothing, as in Classic.

### HP and difficulty

Monster HP scales with the league, so every league size and every hidden season is about equally hard:

> HP = parties × expected party damage per week (by league size) × the season's scoring factor × weeks in the
> chapter's window × difficulty factor × a seeded variation of up to ±15%

- **Parties** is the number at the draft.
- **Expected party damage per week** depends on league size, because bigger leagues spread the talent thinner: 110 at
  2 parties, 109, 105, 104, 102, 100, 99, 97, 96, 94, and 93 at 12 (the average plain weekly damage of a drafted
  Classic lineup, 2012–2025).
- **The season's scoring factor** is how high-scoring the league's hidden season was, against the 2012–2025 average:
  2012 1.04, 2013 1.03, 2014 1.04, 2015 0.96, 2016 0.93, 2017 0.93, 2018 1.11, 2019 0.96, 2020 0.98, 2021 1.00,
  2022 1.08, 2023 1.04, 2024 0.92, 2025 0.96. It is used only on the server and never sent to the client.
- **Difficulty factors:** chapters 1–4 ×1.0, the boss ×1.25.
- **Seeded variation:** each monster's HP varies by up to ±15% from the league seed. Some monsters are a little
  tougher than others, and the season can't be worked out from the HP values.
- Shown HP is rounded to a whole number.

**Balancing (decided 2026-11-09).** Simulated with `npm run simulate:coop` (api/src/scripts/simulate-coop.ts): 5,544
leagues on the real 2012–2025 seasons, every league size from 2 to 12, 12 leagues per season and size, through the real
pool, draft, lineup, auto-swap and strategy code. Every party in a league follows the same plan; free agency isn't
simulated.

| Plan | Win | Lives lost 0 / 1 / 2 / 3 |
|---|---|---|
| Lineups by Level, best starter as Champion (the target) | 66% | 52% / 25% / 13% / 10% |
| Lineup and Champion set against each monster | 93% | 86% / 10% / 3% / 1% |
| Lineups by Level, never a Champion | 12% | 7% / 14% / 22% / 57% |

- **By size** (Level plan): 65% at 2 parties, 67% at 4, 66% at 6, 60% at 8, 71% at 12.
- **By season:** 49% (2017) to 73% (2012, 2016).
- **Where leagues lose:** almost always at the boss (30% of leagues); 4% run out of lives in chapters 3–4. Chapter 1
  is failed most often of the four chapters (20%), while players learn.
- **Pacing:** HP is sized to fill each window, so monsters rarely fall early (the boss starts in week 13 on average)
  and overkill almost never fells a second monster. Banking time stays as a rare reward for a big week (kept,
  2026-11-09).
- **Rejected: the same HP every season.** Adding every party's damage together cancels most weekly luck, so the
  hidden season decided the result: from 6% of leagues winning (2017, 2024) to 100% (2012, 2018, 2022).
- **Rejected: season scaling without the variation.** Results were nearly all-or-nothing (one 5% step in difficulty
  moved the win rate by about 25 points), and HP values could hint at the season.
- **How a league plays matters a lot**, because every party's choices add up. Since a new party has no Champion until
  its player names one, the quest board reminds any party without a Champion to name one.

## Parties and contribution

There's no standings table. Each party's contribution is still visible, because seeing your party help is the point:

- **The quest board:** the current monster's HP bar, the deadline, the league's lives, and each party's damage
  this week and this chapter. Party totals are exact; individual heroes are rounded as in Classic.
  A party without a Champion sees a reminder to name one, since it carries over from week to week.
- **Contribution order**: parties are listed by this chapter's damage, highest first. It's a friendly ranking of who
  helped most, not a result: no party wins or loses against another.
- **Finale:** victory or defeat, every chapter's result, and awards: **Monster Slayer** (most damage over the season),
  **Final Blow** (dealt the most damage in each kill week), and Classic's Natural 20 and Cursed Dice.

## Unchanged from Classic

League sizes 2–12, the automatic snake draft, roster of 10 with 5 starters, the Champion and its carry-over, traits and
synergies, natural 20s and 1s (flavor only), auto-swap, free agency, projections, chat, and the host's cadence and
timing. A league with an odd number of parties needs no dungeon monster, since no one is paired.

## Out of scope for now

- Co-op Dynasty leagues (a campaign that continues across seasons).
- Co-op on Crossover's real-player calendar.
- Simulated turn-based combat (the monster fighting back). Damage stays score-based, like Classic.

## Ruleset

Co-op gets its own ruleset version: chapter count and deadlines, lives, weakness and resistance values, the expected
party damage by size, the season factors, the difficulty factors and the ±15% variation from the simulation. It's
added with the API (build phase 3), along with the `coop` league mode.

## API

Built 2026-11-09. The campaign rules are pure (`api/src/modules/season/campaign.ts`), shared by the season engine and
the balancing simulation, and the Co-op ruleset is version 3 (`COOP_V1`).

- **Creating:** `POST /api/leagues` with `mode: "coop"`; refused (409) unless the API's `COOP_ENABLED` setting is on.
  Never a dynasty for now, and never playoffs (sent `playoffs` is ignored).
- **The draft** runs as in Classic, then sets the league's five monsters from its seed, hidden season and party count.
  There's no schedule.
- **Each game week** adds every party's Classic damage, with the monster's ×1.25 / ×0.75 per class, and plays it
  against the current chapter. The league completes as soon as the campaign is won or lost.
- **`GET /api/leagues/:id/campaign`** (the quest board): lives, outcome, every chapter (name, weaknesses, HP, deadline,
  status, HP left, the week it ended), the next game week, each party's damage last week, this chapter and in all
  (listed by this chapter's damage), and whether the viewer's party has a Champion, for the reminder.
- **`GET /api/leagues/:id/results/:week`** returns `sides` (every party, most damage first) and `campaign` (the
  chapter fought, damage dealt, monsters fallen, any missed deadline); `matchups` is empty.
- **`GET /api/leagues/:id/finale`** returns `mode: "coop"`: victory or defeat, every chapter's result, each party's
  damage, and the awards (Monster Slayer, a Final Blow for each fallen monster, Natural 20, Cursed Dice).
- **My leagues:** the outlook carries `campaign` (chapter, monster, HP, lives, this party's damage last week) and the
  next battle names the monster; there's no standing.
- **Matchup and standings** are refused (409) in Co-op; the schedule is empty.
- **Rules:** `GET /api/rules` gains `coop` (whether it's available, deadlines, lives, class modifiers, the boss's name).
- The boss is **The Dragon Tyrant**.
- **Rechecked** with the engine's own campaign code (whole-number HP): lineups by Level with a Champion win 67%, set
  against each monster 93%, never naming a Champion 12%; 63-71% by league size and 48-80% by season.

## App

Built 2026-11-09. Co-op shows only once `GET /api/rules` says it's available, and never asks for matchups, standings or
the schedule.

- **Hosting:** a third Game choice, Co-op, with a note on the deadlines, lives and boss. It hides the Seasons
  (dynasty) and Champion (playoffs) choices and is sent with `playoffs: false`.
- **The Quest tab** replaces Matchup (`/leagues/:id/quest/:week?`; an old matchup link goes there). It shows the
  campaign board (the monster, its weaknesses, HP, deadline and lives), the Champion reminder, who's dealing the
  damage, every chapter, and each played week: what happened, every party's total and my heroes.
- **League home:** the campaign board in place of standings and this week's battles, a Co-op chip, and once it's
  over a Victory or Defeat banner to the finale.
- **Finale:** victory or defeat, every chapter, the awards, and each party's damage; no podium or standings.
- **My Leagues:** a Co-op tag, the monster, its HP and the lives on each card, and the spotlight's button opens the
  quest board.
- **How it works** has a Co-op section.
- HP is shown rounded up, so a monster with any HP left never reads as 0; damage is shown as whole numbers.

## Build phases

1. **Spec review** (this document): done 2026-11-09.
2. **Balancing simulation:** HP, difficulty factors, and the default values above: done 2026-11-09.
3. **API:** the `coop` league mode, campaign state, resolving a week against the monster, lives, chapter advance,
   finale; tests on both sides of the hidden-player line: built 2026-11-09 (see "API" below). Co-op leagues can be
   created only once `COOP_ENABLED` is on.
4. **App:** create a Co-op league, the quest board, chapter and finale screens, How it works: built 2026-11-09 (see
   "App" above). Next: switch on `COOP_ENABLED` (docs/DEPLOY.md, section 10).
