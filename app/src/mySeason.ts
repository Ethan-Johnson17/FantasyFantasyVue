import type { ScheduleWeek } from './api/types'

/* My battle each week of the season, described from my side. */

export interface MyWeek {
  week: number
  /** The opposing party, or the dungeon monster's name */
  opponent: string | null
  monster: boolean
  played: boolean
  outcome: 'win' | 'loss' | 'draw' | null
  myTotal: number | null
  theirTotal: number | null
  /** Crossover: boards won each side, e.g. 2-0 or 1-1; null in Classic and before the battle */
  boards: { mine: number; theirs: number } | null
}

export function mySeason(schedule: readonly ScheduleWeek[], myPartyId: string | undefined): MyWeek[] {
  return schedule.map(week => {
    const mine = week.matchups.find(m => m.home.partyId === myPartyId || m.away?.partyId === myPartyId)
    const amHome = mine?.home.partyId === myPartyId
    const result = mine?.result ?? null
    // Crossover: two boards. A sweep is a win, a split a draw, as in the standings.
    const boards =
      result?.gridironOutcome
        ? [result.outcome, result.gridironOutcome].reduce(
            (score, outcome) => {
              if (outcome === 'draw') return { mine: score.mine + 0.5, theirs: score.theirs + 0.5 }
              return (outcome === 'home') === amHome ? { ...score, mine: score.mine + 1 } : { ...score, theirs: score.theirs + 1 }
            },
            { mine: 0, theirs: 0 }
          )
        : null
    const boardOutcome = boards ? (boards.mine > boards.theirs ? 'win' : boards.mine < boards.theirs ? 'loss' : 'draw') : null
    return {
      week: week.week,
      opponent: mine ? (amHome ? (mine.away?.name ?? result?.monster ?? 'Dungeon monster') : mine.home.name) : null,
      monster: !!mine && !mine.away,
      played: !!result,
      outcome: !result ? null : (boardOutcome ?? (result.outcome === 'draw' ? 'draw' : (result.outcome === 'home') === amHome ? 'win' : 'loss')),
      myTotal: result ? (amHome ? result.homeTotal : result.awayTotal) : null,
      theirTotal: result ? (amHome ? result.awayTotal : result.homeTotal) : null,
      boards
    }
  })
}
