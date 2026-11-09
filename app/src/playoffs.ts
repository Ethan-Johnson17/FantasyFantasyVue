import type { LeaguePlayoffs, MatchupKind } from './api/types'

/*
 * Playoffs (docs/CLASSIC_SCORING.md and docs/CROSSOVER_SPEC.md, "Playoffs"): the bracket follows the league's regular
 * season, one round a week. Mirrors api/src/modules/season/bracket.ts.
 */

/** The playoff round's name for a week ("Semifinals"), or null for a regular-season week. */
export function roundName(format: LeaguePlayoffs | null | undefined, week: number): string | null {
  if (!format || week <= format.regularWeeks || week > format.regularWeeks + format.rounds) return null
  const names = format.spots === 6 ? ['Quarterfinals', 'Semifinals', 'Final'] : format.spots === 4 ? ['Semifinals', 'Final'] : ['Final']
  return names[week - format.regularWeeks - 1] ?? null
}

/** What a battle in a playoff week is: its round, or a consolation battle that counts for nothing. */
export function stageOf(format: LeaguePlayoffs | null | undefined, week: number, kind: MatchupKind | undefined): string | null {
  if (kind === 'consolation') return 'Consolation'
  return kind === 'playoff' ? roundName(format, week) : null
}
