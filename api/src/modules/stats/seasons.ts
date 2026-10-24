import { FIRST_AVAILABLE_SEASON } from './nflverse.js'

/**
 * The NFL season being played (or next up) at a given time. A season runs September to February, so
 * from March on the calendar year's season is the current one.
 */
export function currentNflSeason(now: Date = new Date()): number {
  return now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
}

/** Parses "2023" or "2011-2025" into a list of seasons, rejecting seasons nflverse doesn't have. */
export function parseSeasonRange(input: string, latestSeason = new Date().getFullYear()): number[] {
  const match = /^(\d{4})(?:-(\d{4}))?$/.exec(input.trim())
  if (!match?.[1]) throw new Error(`Invalid --seasons value "${input}". Use e.g. 2023 or 2011-2025.`)
  const from = Number(match[1])
  const to = Number(match[2] ?? match[1])
  if (from > to) throw new Error(`Season range is backwards: ${input}`)
  if (from < FIRST_AVAILABLE_SEASON || to > latestSeason) {
    throw new Error(`Seasons must be between ${String(FIRST_AVAILABLE_SEASON)} and ${String(latestSeason)}`)
  }
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}
