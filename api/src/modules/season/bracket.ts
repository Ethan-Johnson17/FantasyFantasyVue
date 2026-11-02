/*
 * The playoff bracket (docs/CLASSIC_SCORING.md, "Playoffs"). Pure: seeds and earlier winners in, games out.
 * The regular season is weeks 1-14; playoffs use the hidden season's weeks 15-17, one round a week.
 */

export const REGULAR_SEASON_WEEKS = 14

export interface PlayoffFormat {
  /** Parties in the bracket */
  spots: number
  /** Playoff weeks after the regular season */
  rounds: number
}

/** The bracket scales with the league: a final for 2-3 parties, top 4 for 4-7, top 6 (top 2 on a bye) for 8-12. */
export function playoffFormat(partyCount: number): PlayoffFormat {
  if (partyCount <= 3) return { spots: 2, rounds: 1 }
  if (partyCount <= 7) return { spots: 4, rounds: 2 }
  return { spots: 6, rounds: 3 }
}

/** Each round's name, by bracket size. */
export function roundName(format: PlayoffFormat, round: number): string {
  const names = format.spots === 6 ? ['Quarterfinals', 'Semifinals', 'Final'] : format.spots === 4 ? ['Semifinals', 'Final'] : ['Final']
  return names[round - 1] ?? 'Playoffs'
}

export interface BracketGame {
  /** The higher seed, who also advances if the battle is a draw */
  high: string
  low: string
}

/**
 * The games of a playoff round. `seeds` is the regular season's final order (best first); `winners[r]` lists the
 * winners of round r + 1. Higher seeds always play the lowest seeds left.
 */
export function roundGames(format: PlayoffFormat, seeds: readonly string[], round: number, winners: readonly (readonly string[])[]): BracketGame[] {
  const seed = (n: number) => {
    const id = seeds[n - 1]
    if (!id) throw new Error(`No seed ${String(n)}`)
    return id
  }
  const bySeed = (ids: readonly string[]) => [...ids].sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b))
  // Pairs the best of a group against the worst, the second best against the second worst, and so on.
  const pair = (ids: readonly string[]): BracketGame[] => {
    const ordered = bySeed(ids)
    return Array.from({ length: ordered.length / 2 }, (_, i) => ({ high: ordered[i] ?? '', low: ordered[ordered.length - 1 - i] ?? '' }))
  }
  if (round === 1) {
    if (format.spots === 2) return [{ high: seed(1), low: seed(2) }]
    if (format.spots === 4) return pair([seed(1), seed(2), seed(3), seed(4)])
    return pair([seed(3), seed(4), seed(5), seed(6)])
  }
  const previous = winners[round - 2] ?? []
  // Top-6 brackets: the top two seeds, rested in round 1, join the round 1 winners.
  if (format.spots === 6 && round === 2) return pair([seed(1), seed(2), ...previous])
  return pair(previous)
}

/** The seeds resting on a bye that round: the top two of a top-6 bracket, in round 1. */
export function byeSeeds(format: PlayoffFormat, seeds: readonly string[], round: number): string[] {
  return format.spots === 6 && round === 1 ? seeds.slice(0, 2) : []
}

/** The winner of a played bracket game: the higher seed takes a draw. */
export function gameWinner(game: BracketGame, outcome: 'home' | 'away' | 'draw'): string {
  return outcome === 'away' ? game.low : game.high
}
