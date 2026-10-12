import type { Rng } from '../../lib/random.js'

export const SEASON_WEEKS = 14

export interface Matchup {
  home: string
  /** null: the home party fights the dungeon monster */
  away: string | null
}

export interface ScheduledWeek {
  week: number
  matchups: Matchup[]
}

/**
 * Round-robin schedule (circle method) repeated to fill the season. With an odd number of
 * parties, the party paired with the empty seat fights the monster that week.
 */
export function roundRobin(partyIds: readonly string[], rng: Rng, weeks = SEASON_WEEKS): ScheduledWeek[] {
  if (partyIds.length < 2) throw new Error('A schedule needs at least 2 parties')
  const seats: (string | null)[] = rng.shuffle(partyIds)
  if (seats.length % 2 === 1) seats.push(null)
  const rounds = seats.length - 1

  return Array.from({ length: weeks }, (_, index) => {
    // Keep seat 0 fixed and rotate the rest by the round number.
    const rotation = index % rounds
    const rotated = [seats[0] ?? null, ...rotate(seats.slice(1), rotation)]
    const matchups: Matchup[] = []
    for (let i = 0; i < rotated.length / 2; i++) {
      const a = rotated[i] ?? null
      const b = rotated[rotated.length - 1 - i] ?? null
      if (a === null && b === null) continue
      matchups.push(a === null ? { home: b as string, away: null } : { home: a, away: b })
    }
    return { week: index + 1, matchups }
  })
}

function rotate<T>(items: readonly T[], steps: number): T[] {
  if (items.length === 0) return []
  const shift = steps % items.length
  return [...items.slice(items.length - shift), ...items.slice(0, items.length - shift)]
}
