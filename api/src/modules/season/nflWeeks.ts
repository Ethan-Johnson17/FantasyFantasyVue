import { Conflict } from '../../lib/errors.js'
import { currentNflSeason } from '../stats/seasons.js'
import { NflGameModel } from '../stats/stats.models.js'

/*
 * The real NFL calendar that Crossover leagues follow (docs/CROSSOVER_SPEC.md, "Calendar").
 */

/** Crossover plays through NFL week 17, so week 18's rested starters don't decide titles. */
export const LAST_CROSSOVER_WEEK = 17
/** A league needs at least this many weeks left when its draft runs. */
export const MIN_CROSSOVER_WEEKS = 4

/** The first regular-season week whose first kickoff is after `at`, or null if none is left. */
export async function firstWeekAfter(season: number, at: Date): Promise<number | null> {
  const weeks = await NflGameModel.aggregate<{ _id: number; firstKickoff: Date }>([
    { $match: { season, seasonType: 'REG' } },
    { $group: { _id: '$week', firstKickoff: { $min: '$kickoff' } } },
    { $sort: { _id: 1 } }
  ])
  return weeks.find(week => week.firstKickoff > at)?._id ?? null
}

export interface CrossoverWindow {
  season: number
  /** The league's first week: the first NFL week starting after the draft */
  firstWeek: number
}

/** The season and first week for a Crossover league drafting at `at`; refused when too little season is left. */
export async function crossoverWindow(at: Date): Promise<CrossoverWindow> {
  const season = currentNflSeason(at)
  if (!(await NflGameModel.exists({ season, seasonType: 'REG' }))) {
    throw new Conflict(`The ${String(season)} NFL schedule isn’t available yet, so Crossover leagues can’t start`)
  }
  const firstWeek = await firstWeekAfter(season, at)
  if (firstWeek === null || LAST_CROSSOVER_WEEK - firstWeek + 1 < MIN_CROSSOVER_WEEKS) {
    throw new Conflict(`Too little of the NFL season is left for a Crossover league; Classic plays any time`)
  }
  return { season, firstWeek }
}
