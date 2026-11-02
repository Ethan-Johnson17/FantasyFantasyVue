import type { MatchupKind, PlayoffFormat } from './api/types'

/*
 * Classic playoffs (docs/CLASSIC_SCORING.md, "Playoffs"): the bracket follows the 14-week regular season, one
 * round a week. Mirrors api/src/modules/season/bracket.ts.
 */

export const REGULAR_SEASON_WEEKS = 14

/** The playoff round's name for a week ("Semifinals"), or null for a regular-season week. */
export function roundName(format: PlayoffFormat | null | undefined, week: number): string | null {
  if (!format || week <= REGULAR_SEASON_WEEKS || week > REGULAR_SEASON_WEEKS + format.rounds) return null
  const names = format.spots === 6 ? ['Quarterfinals', 'Semifinals', 'Final'] : format.spots === 4 ? ['Semifinals', 'Final'] : ['Final']
  return names[week - REGULAR_SEASON_WEEKS - 1] ?? null
}

/** What a battle in a playoff week is: its round, or a consolation battle that counts for nothing. */
export function stageOf(format: PlayoffFormat | null | undefined, week: number, kind: MatchupKind | undefined): string | null {
  if (kind === 'consolation') return 'Consolation'
  return kind === 'playoff' ? roundName(format, week) : null
}
