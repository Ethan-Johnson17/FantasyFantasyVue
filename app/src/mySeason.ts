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
}

export function mySeason(schedule: readonly ScheduleWeek[], myPartyId: string | undefined): MyWeek[] {
  return schedule.map(week => {
    const mine = week.matchups.find(m => m.home.partyId === myPartyId || m.away?.partyId === myPartyId)
    const amHome = mine?.home.partyId === myPartyId
    const result = mine?.result ?? null
    return {
      week: week.week,
      opponent: mine ? (amHome ? (mine.away?.name ?? result?.monster ?? 'Dungeon monster') : mine.home.name) : null,
      monster: !!mine && !mine.away,
      played: !!result,
      outcome: !result ? null : result.outcome === 'draw' ? 'draw' : (result.outcome === 'home') === amHome ? 'win' : 'loss',
      myTotal: result ? (amHome ? result.homeTotal : result.awayTotal) : null,
      theirTotal: result ? (amHome ? result.awayTotal : result.homeTotal) : null
    }
  })
}
