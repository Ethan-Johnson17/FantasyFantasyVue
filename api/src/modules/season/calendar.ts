import { CADENCE_MS, type LeagueDocument } from '../leagues/league.model.js'
import { nflWeekReady } from './nflWeeks.js'
import { SEASON_WEEKS } from './schedule.js'

/*
 * A league's calendar: how many game weeks it plays, which NFL week each one uses, and when each is due.
 * Classic replays a hidden season on the host's cadence (game week k is NFL week k). Crossover follows the
 * real season (docs/CROSSOVER_SPEC.md, "Calendar"): game week k is NFL week (first week + k - 1), due the
 * Tuesday morning after its games, once the data for every game is in.
 */

type CalendarLeague = Pick<LeagueDocument, 'mode' | 'weekOneAt' | 'cadence' | 'nflWeeks'>

/** Game weeks in the league's season. */
export function seasonLength(league: CalendarLeague): number {
  return league.mode === 'crossover' ? (league.nflWeeks?.length ?? 0) : SEASON_WEEKS
}

/** The NFL week whose stats a game week uses. Week 0 is the week before the league's first. */
export function nflWeekOf(league: CalendarLeague, week: number): number {
  if (league.mode !== 'crossover') return week
  const first = league.nflWeeks?.[0]?.nflWeek
  if (first === undefined) throw new Error('This Crossover league has no calendar yet')
  return first + week - 1
}

/** When a game week is due to resolve, or null before the calendar exists. */
export function resolvesAt(league: CalendarLeague, week: number): Date | null {
  if (league.mode === 'crossover') return league.nflWeeks?.[week - 1]?.finalAt ?? null
  return league.weekOneAt ? new Date(league.weekOneAt.getTime() + (week - 1) * CADENCE_MS[league.cadence]) : null
}

/** How many game weeks are due by the clock (0 before week 1). */
export function weeksDueByTime(league: CalendarLeague, now = Date.now()): number {
  let due = 0
  for (let week = 1; week <= seasonLength(league); week++) {
    const at = resolvesAt(league, week)
    if (!at || at.getTime() > now) break
    due = week
  }
  return due
}

/**
 * How many game weeks can resolve now: due by the clock and, for Crossover, with every game of the NFL week
 * final and imported since it went final. A Crossover week whose data is late waits for it.
 */
export async function weeksReady(
  league: CalendarLeague & Pick<LeagueDocument, 'resolvedWeeks'>,
  season: number,
  now = Date.now()
): Promise<number> {
  const due = weeksDueByTime(league, now)
  if (league.mode !== 'crossover') return due
  for (let week = league.resolvedWeeks + 1; week <= due; week++) {
    const finalAt = resolvesAt(league, week)
    if (!finalAt || !(await nflWeekReady(season, nflWeekOf(league, week), finalAt))) return week - 1
  }
  return due
}
