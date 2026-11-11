import { CADENCE_MS, type LeagueDocument } from '../leagues/league.model.js'
import { MIN_CROSSOVER_WEEKS, nflWeekReady } from './nflWeeks.js'
import { formatForRounds, playoffFormat, type PlayoffFormat } from './bracket.js'
import { SEASON_WEEKS } from './schedule.js'

/*
 * A league's calendar: how many game weeks it plays, which NFL week each one uses, and when each is due.
 * Classic replays a hidden season on the host's cadence (game week k is NFL week k). Crossover follows the
 * real season (docs/CROSSOVER_SPEC.md, "Calendar"): game week k is NFL week (first week + k - 1), due the
 * Tuesday morning after its games, once the data for every game is in.
 */

type CalendarLeague = Pick<LeagueDocument, 'mode' | 'weekOneAt' | 'cadence' | 'nflWeeks' | 'playoffs' | 'partyCount'>

/** Crossover and Solo play the real NFL season as it happens; Classic and Co-op replay a hidden one. */
export function followsNfl(mode: LeagueDocument['mode']): boolean {
  return mode === 'crossover' || mode === 'solo'
}

/** Game weeks in the league's season: Classic adds its playoff rounds to the 14-week regular season, and
 * Crossover's playoffs fit inside its NFL weeks. */
export function seasonLength(league: CalendarLeague): number {
  if (followsNfl(league.mode)) return league.nflWeeks?.length ?? 0
  return SEASON_WEEKS + (league.playoffs ? playoffFormat(league.partyCount).rounds : 0)
}

export interface LeaguePlayoffs extends PlayoffFormat {
  /** Game weeks before the bracket; playoff round r is game week regularWeeks + r */
  regularWeeks: number
}

/**
 * The league's playoffs: bracket size and rounds, and the regular season before them. null without playoffs, for a
 * Crossover league before its draft sets the calendar, or for one too short for them. Crossover's bracket fills the
 * league's last weeks (the final is NFL week 17), shrinking to keep a regular season of MIN_CROSSOVER_WEEKS.
 */
export function leaguePlayoffs(
  league: Pick<LeagueDocument, 'mode' | 'playoffs' | 'partyCount'> & { nflWeeks?: readonly unknown[] | null }
): LeaguePlayoffs | null {
  if (!league.playoffs) return null
  const bySize = playoffFormat(league.partyCount)
  if (league.mode !== 'crossover') return { ...bySize, regularWeeks: SEASON_WEEKS }
  const weeks = league.nflWeeks?.length ?? 0
  const rounds = Math.min(bySize.rounds, weeks - MIN_CROSSOVER_WEEKS)
  if (rounds < 1) return null
  return { ...formatForRounds(rounds), regularWeeks: weeks - rounds }
}

/** The NFL week whose stats a game week uses. Week 0 is the week before the league's first. */
export function nflWeekOf(league: CalendarLeague, week: number): number {
  if (!followsNfl(league.mode)) return week
  const first = league.nflWeeks?.[0]?.nflWeek
  if (first === undefined) throw new Error('This Crossover league has no calendar yet')
  return first + week - 1
}

/** When a game week is due to resolve, or null before the calendar exists. */
export function resolvesAt(league: CalendarLeague, week: number): Date | null {
  if (followsNfl(league.mode)) return league.nflWeeks?.[week - 1]?.finalAt ?? null
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
  if (!followsNfl(league.mode)) return due
  for (let week = league.resolvedWeeks + 1; week <= due; week++) {
    const finalAt = resolvesAt(league, week)
    if (!finalAt || !(await nflWeekReady(season, nflWeekOf(league, week), finalAt))) return week - 1
  }
  return due
}
