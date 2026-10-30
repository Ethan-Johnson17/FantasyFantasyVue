# Dynasty Spec (Classic)

> Status: **approved** (2026-10-29), including every *(default)*. Phase 1 (the chain and the offseason) is built.

## Goals

1. **Parties last longer than a season.** A league plays a chain of seasons; parties keep their name, crest, record,
   trophies and a few heroes from one season to the next.
2. **Heroes grow.** A hero kept season after season gains experience, on top of whatever their real next season holds.
3. **Every season stays competitive.** Most of each roster is redrafted, so a weak party can rebuild in one season.
4. **Classic's rules hold.** Players and seasons stay hidden; nothing about the real player behind a hero is revealed,
   even across seasons.

Decided with the user on 2026-10-29: Classic first (Crossover later), keepers, Levels recalculated each season plus an
XP bonus (a small damage bonus and an earned trait), 3 keepers of 10 using a party's first picks, the host picks a
3- or 5-season dynasty, and a new member can take over a party whose owner leaves.

## Real-data check (2012–2025, six-party pools)

| Measure | Result |
| --- | --- |
| Pool heroes still playing the next season | **93%** (retirements and injuries take about 1 in 14) |
| Still good enough to make a fresh draft pool | **57%** |
| Returning heroes whose Level stays the same | 17% |
| Returning heroes whose Level moves 3 or more | **41%** |

So a kept hero is a real bet: nearly all keep playing, but Levels swing a lot. Re-leveling each season (from the season
just played, the same rule as today) gives keepers genuine information and a natural "level up / level down" moment.

## The chain of hidden seasons

- Each season of a dynasty replays the **next** real NFL season for the same players: a dynasty that starts in hidden
  season 2019 plays 2019, then 2020, then 2021. Heroes follow their real players from one year to the next.
- The host picks the length when creating the league: **3 or 5 seasons**. The starting season is drawn at random from
  those where the whole chain fits within the finished seasons we've imported (today: a 5-season dynasty starts in
  2021 or earlier, a 3-season one in 2023 or earlier), and stays hidden.
- Each season is played exactly like a Classic season (draft, 14 weeks, standings, finale), at the league's cadence.
  The final season's champion is the **dynasty champion**.

## Between seasons: the offseason

When a season's finale is reached, the league enters the **offseason**:

1. **Level up.** Every hero in the next season's pool, kept or not, is re-leveled from the season just played, and
   traits are recalculated, exactly as Classic builds a pool today. Kept heroes show their old and new Level.
2. **Keepers.** Each party chooses up to **3 heroes to keep** before the host starts the draft. Keepers count as that
   party's first draft picks (rounds 1–3), so every party ends with 10 heroes. A party that keeps fewer picks earlier
   in those rounds. Retired heroes (no games in the next season) can't be kept and are shown as retired.
   *(default)* Parties that don't choose keep nobody.
3. **The new pool.** Built for the next season as usual (veterans by Level, mystery recruits from that season's NFL
   draft), leaving out every kept hero.
4. **Draft order.** *(default)* Reverse of the final standings, so last place picks first in each round after keepers.
5. **Draft.** The host schedules it as now; the automatic snake draft fills rounds 4–10.

Heroes keep their name and look across seasons: the same hero, a year older.

## Experience (XP)

- **Earning XP.** *(default)* A hero earns XP equal to the damage they dealt for their party in a season (counted
  damage, so bench weeks earn nothing). XP builds up across seasons **while the hero stays with the same party**
  (kept); a hero who is dropped, released or redrafted by someone else starts again at 0.
- **Damage bonus.** XP sets a tier, and each tier adds a small bonus to the hero's damage the next season: tiers 1–4
  add **+1% / +2% / +3% / +4%** (capped at +4%). *(default thresholds, set by simulation: roughly a season as a regular
  starter for tier 1, two strong seasons for tier 4.)*
- **Earned trait.** Reaching **tier 4** earns the hero one new trait the next season (Steadfast, Wild or Mighty; the one
  they're closest to qualifying for, never conflicting with one they have). At most one earned trait per hero.
- XP, tiers and earned traits are shown on the hero page and the keeper screen. They're game numbers, not stats, so they
  reveal nothing about the real player.

**Balancing goal**, checked by simulation on 2012–2025 chains before the values are locked: keeping and building XP
beats ignoring it by a few points of win rate, but a party with three tier-4 keepers doesn't run away from a party that
rebuilt through the draft.

## Members and parties

- Members stay in the dynasty from season to season with the same party.
- **Leaving:** in the offseason a member can leave. Their party becomes **open**: the host can share its PIN link so a
  new member **takes it over**, keeping its name (renamable), crest, history, keepers and XP. *(default)* If nobody has
  taken it when the host schedules the draft, its keepers return to the pool and the party leaves the dynasty.
- **Joining:** *(default)* new parties can join in the offseason up to the league's maximum, with no keepers.
- Account deletion works as today: the party stays as "Former adventurer" and can be taken over.

## What players see

- **League page:** "Season 2 of 5", the dynasty standings (titles, all-time record), and in the offseason the keeper
  deadline and draft time.
- **Keeper screen:** the roster with each hero's new Level (and the change), XP tier, earned trait, and retired heroes
  marked; choose up to 3.
- **Hero page:** seasons with the party, XP and tier, Level history.
- **Finale:** each season's finale as now; the last season adds the dynasty champion and all-time awards.

## Hidden-player rule

Several consecutive seasons give a curious player more rounded numbers to compare against public stats. Damage stays
rounded to whole numbers and seasons stay hidden, as today. Decided 2026-10-29: that's enough; earlier seasons stay
fully viewable, with nothing extra hidden.

## Build phases

1. **Chain and offseason:** dynasty leagues (length, hidden starting season), season transitions, re-leveling, the new
   pool and keepers, reverse-standings draft order.
2. **XP:** earning, tiers, the damage bonus and earned traits; balancing simulation.
3. **Members:** leaving, open parties and takeovers, joining in the offseason.
4. **App:** dynasty setup on Host, keeper screen, offseason league page, dynasty standings and hero history.

Crossover dynasty (real seasons, one per year) is out of scope for now.
