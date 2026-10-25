import mongoose from 'mongoose'
import type { HeroDocument } from '../heroes/hero.model.js'
import { expectedLevel } from '../heroes/pool.js'
import { LeagueModel, type LeagueDocument } from '../leagues/league.model.js'
import { getRuleset } from '../scoring/rulesets.js'
import { nflWeekOf } from './calendar.js'
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
  /** Average over every played week so far (not "season": that name is kept off the wire entirely) */
  average: number | null
  /** Average over the latest few played weeks */
  recent: number | null
  /** Weeks the hero played (didn't rest) */
  played: number
  /** Mystery recruits after a few battles: the veteran Level their damage so far matches */
  playingLike: number | null
  /** Projected class damage for the next battle (rounded), before Champion or swap modifiers */
  projected: number
}

/**
 * Projection: a hero's damage so far blended with what their Level typically deals, the Level counting
 * as this many battles. Early on it leans on Level; after a few battles the hero's own results take
 * over. Backtested on 2012-2025 (2026-10-22): mean error 8.6 damage a battle, against 8.8 for Level
 * alone and 9.0 for the season average alone. Battles are noisy, so projections compare heroes rather
 * than promise scores.
 */
export const PROJECTION_PRIOR_BATTLES = 3

/**
 * The last NFL week form covers. Classic: the weeks its battles have used. Crossover's players are real, so
 * their whole season counts: every week before the next battle, or before the draft, every game so far.
 */
export function formThroughWeek(league: LeagueDocument): number {
  if (league.mode !== 'crossover') return league.resolvedWeeks
  return league.nflWeeks?.length ? nflWeekOf(league, league.resolvedWeeks) : Number.MAX_SAFE_INTEGER
}

/** What a hero's Level typically deals; a mystery recruit's range midpoint falls between Levels. */
export function levelBaseline(hero: Pick<HeroDocument, 'level' | 'levelRange'>, levelDamage: readonly number[]): number {
  const level = Math.min(10, Math.max(1, expectedLevel(hero)))
  const low = Math.floor(level)
  const share = level - low
  const at = (n: number) => levelDamage[n - 1] ?? 0
  return at(low) * (1 - share) + at(Math.min(10, low + 1)) * share
}

/** The blended projection from exact past damage (played battles only). */
export function projectDamage(past: readonly number[], baseline: number): number {
  return (past.reduce((sum, value) => sum + value, 0) + PROJECTION_PRIOR_BATTLES * baseline) / (past.length + PROJECTION_PRIOR_BATTLES)
}

/** Battles a mystery recruit must have fought before "playing like" is shown. */
export const PLAYING_LIKE_MIN_BATTLES = 3

/** The highest Level whose typical damage this matches (Level 1 at least). */
export function levelForDamage(damage: number, levelDamage: readonly number[]): number {
  let level = 1
  levelDamage.forEach((typical, index) => {
    if (damage >= typical) level = index + 1
  })
  return level
}

/** Form for each hero over the league's resolved weeks; heroes need `source` selected. */
export async function heroForm(league: LeagueDocument, heroes: readonly HeroDocument[]): Promise<Map<string, HeroForm>> {
  const ruleset = getRuleset(league.rulesetVersion)
  const empty = new Map(
    heroes.map(hero => [
      hero.id,
      { average: null, recent: null, played: 0, playingLike: null, projected: Math.round(levelBaseline(hero, ruleset.levelDamage[hero.heroClass])) }
    ])
  )
  const throughWeek = formThroughWeek(league)
  if (throughWeek === 0) return empty
  const season = (await LeagueModel.findById(league._id).select('+season'))?.season
  if (season === undefined || season === null) return empty

  const weeks = { season, seasonType: 'REG' as const, week: trusted({ $lte: throughWeek }) }
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
      const exact = damage.reduce((sum, value) => sum + value, 0) / Math.max(1, damage.length)
      const playingLike =
        hero.level === null && damage.length >= PLAYING_LIKE_MIN_BATTLES ? levelForDamage(exact, ruleset.levelDamage[hero.heroClass]) : null
      const projected = Math.round(projectDamage(damage, levelBaseline(hero, ruleset.levelDamage[hero.heroClass])))
      return [hero.id, { average: average(damage), recent: average(damage.slice(0, RECENT_WEEKS)), played: damage.length, playingLike, projected }]
    })
  )
}
