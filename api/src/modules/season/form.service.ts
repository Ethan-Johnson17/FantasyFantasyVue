import mongoose from 'mongoose'
import type { HeroDocument } from '../heroes/hero.model.js'
import { LeagueModel, type LeagueDocument } from '../leagues/league.model.js'
import { getRuleset } from '../scoring/rulesets.js'
import { scoreDefense, scoreOffense } from '../scoring/scoring.js'
import { DefenseWeekStatModel, PlayerWeekStatModel } from '../stats/stats.models.js'

/*
 * Recent form for the hero list, so free agents can be compared at a glance. Every hero is measured
 * the same way, drafted or not: class damage (points x class multiplier) in each played week, before
 * Champion or swap modifiers. Averages are rounded, like every damage figure players see.
 */

const { trusted } = mongoose

/** How many of a hero's latest played weeks count as recent form. */
export const RECENT_WEEKS = 3

export interface HeroForm {
  /** Average over every played week so far */
  season: number | null
  /** Average over the latest few played weeks */
  recent: number | null
  /** Weeks the hero played (didn't rest) */
  played: number
}

/** Form for each hero over the league's resolved weeks; heroes need `source` selected. */
export async function heroForm(league: LeagueDocument, heroes: readonly HeroDocument[]): Promise<Map<string, HeroForm>> {
  const empty = new Map(heroes.map(hero => [hero.id, { season: null, recent: null, played: 0 }]))
  if (league.resolvedWeeks === 0) return empty
  const season = (await LeagueModel.findById(league._id).select('+season'))?.season
  if (season === undefined || season === null) return empty

  const ruleset = getRuleset(league.rulesetVersion)
  const weeks = { season, seasonType: 'REG' as const, week: trusted({ $lte: league.resolvedWeeks }) }
  const playerIds = heroes.filter(hero => hero.source.kind === 'player').map(hero => hero.source.id)
  const teams = heroes.filter(hero => hero.source.kind === 'defense').map(hero => hero.source.id)
  const [playerLines, defenseLines] = await Promise.all([
    PlayerWeekStatModel.find({ ...weeks, playerId: trusted({ $in: playerIds }) }, 'playerId week stats').lean(),
    DefenseWeekStatModel.find({ ...weeks, team: trusted({ $in: teams }) }, 'team week stats').lean()
  ])
  const pointsBySource = new Map<string, { week: number; points: number }[]>()
  const add = (key: string, week: number, points: number) => pointsBySource.set(key, [...(pointsBySource.get(key) ?? []), { week, points }])
  for (const line of playerLines) add(`player|${line.playerId}`, line.week, scoreOffense(line.stats, ruleset))
  for (const line of defenseLines) add(`defense|${line.team}`, line.week, scoreDefense(line.stats, ruleset))

  const average = (values: readonly number[]) => (values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null)
  return new Map(
    heroes.map(hero => {
      const multiplier = ruleset.lineup.classMultipliers[hero.heroClass]
      const played = [...(pointsBySource.get(`${hero.source.kind}|${hero.source.id}`) ?? [])].sort((a, b) => b.week - a.week)
      const damage = played.map(entry => entry.points * multiplier)
      return [hero.id, { season: average(damage), recent: average(damage.slice(0, RECENT_WEEKS)), played: damage.length }]
    })
  )
}
