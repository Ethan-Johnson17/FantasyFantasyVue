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

Monster HP scales with the league so every size is about equally hard:

> HP = parties × expected party damage per week × weeks in the chapter's window × difficulty factor

- **Parties** is the number at the draft.
- **Expected party damage** comes from the ruleset (the average weekly damage of a drafted Classic lineup).
- **The difficulty factor** is tuned by simulation on the real 2012–2025 seasons, as Crossover's Quest was, so that
  **about two in three leagues win**. The boss's factor is higher than the chapters'.
- The simulation runs leagues of 2, 4, 6, 8 and 12 parties through the real draft, lineup and auto-swap code, with each
  party following a plan (ranking by Level, playing to the monster's weaknesses, never setting a Champion), and checks
  that league size and plan don't swing the win rate much. It also reports how often lives are lost and which chapter
  leagues fail at.

## Parties and contribution

There's no standings table. Each party's contribution is still visible, because seeing your party help is the point:

- **The quest board:** the current monster's HP bar, the deadline, the league's lives, and each party's damage
  this week and this chapter. Party totals are exact; individual heroes are rounded as in Classic.
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
party damage and difficulty factors from the simulation.

## Build phases

1. **Spec review** (this document): done 2026-11-09.
2. **Balancing simulation:** HP, difficulty factors, and the default values above.
3. **API:** the `coop` league mode, campaign state, resolving a week against the monster, lives, chapter advance,
   finale; tests on both sides of the hidden-player line.
4. **App:** create a Co-op league, the quest board, chapter and finale screens, How it works.
