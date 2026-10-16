import mongoose from 'mongoose'
import type { Rng } from '../../lib/random.js'
import { CLASS_BY_POSITION } from '../heroes/classes.js'
import type { PoolCandidate } from '../heroes/pool.js'
import type { Ruleset } from '../scoring/rulesets.js'
import { scoreDefense, scoreOffense } from '../scoring/scoring.js'
import { DefenseWeekStatModel, NflPlayerModel, PlayerWeekStatModel } from '../stats/stats.models.js'

const { trusted } = mongoose

/** Leagues use regular-season weeks 1–14 for matchups. */
export const LAST_MATCHUP_WEEK = 14
export const FIRST_LEAGUE_SEASON = 2012
export const LAST_LEAGUE_SEASON = 2025
/** Veterans need this many games last season for a meaningful points-per-game. */
export const MIN_PREVIOUS_GAMES = 4

/** Picks a random hidden season that has stats for both it and the previous season. */
export async function pickSeason(rng: Rng): Promise<number> {
  const [playerSeasons, defenseSeasons] = await Promise.all([
    PlayerWeekStatModel.distinct('season'),
    DefenseWeekStatModel.distinct('season')
  ])
  const imported = new Set(playerSeasons.filter(season => defenseSeasons.includes(season)))
  const eligible = [...imported]
    .filter(season => season >= FIRST_LEAGUE_SEASON && season <= LAST_LEAGUE_SEASON && imported.has(season - 1))
    .sort((a, b) => a - b)
  if (eligible.length === 0) throw new Error('No eligible seasons imported; run import:stats first')
  return rng.pick(eligible)
}

/**
 * Everyone who could be in a league's hero pool for the given season: players with a game in
 * weeks 1–14, rated by last season's points per game (or flagged as rookies), plus team defenses.
 */
export async function loadPoolCandidates(season: number, ruleset: Ruleset): Promise<PoolCandidate[]> {
  const playedThisSeason = await PlayerWeekStatModel.find(
    { season, seasonType: 'REG', week: trusted({ $lte: LAST_MATCHUP_WEEK }) },
    'playerId position week'
  )
    .sort({ week: 1 })
    .lean()
  // Position as of the player's first game this season
  const positionById = new Map<string, keyof typeof CLASS_BY_POSITION>()
  for (const line of playedThisSeason) {
    if (!positionById.has(line.playerId)) positionById.set(line.playerId, line.position)
  }
  const ids = [...positionById.keys()]

  const [lastSeasonLines, players] = await Promise.all([
    PlayerWeekStatModel.find({ season: season - 1, seasonType: 'REG', playerId: trusted({ $in: ids }) }, 'playerId stats').lean(),
    NflPlayerModel.find({ _id: trusted({ $in: ids }) }, 'draft').lean()
  ])
  const lastSeason = new Map<string, number[]>()
  for (const line of lastSeasonLines) {
    const weeks = lastSeason.get(line.playerId) ?? []
    weeks.push(scoreOffense(line.stats, ruleset))
    lastSeason.set(line.playerId, weeks)
  }
  const draftById = new Map(players.map(player => [player._id, player.draft]))

  const offense = ids.flatMap((id): PoolCandidate[] => {
    const position = positionById.get(id)
    if (!position) return []
    const heroClass = CLASS_BY_POSITION[position]
    const previous = lastSeason.get(id)
    if (previous && previous.length >= MIN_PREVIOUS_GAMES) {
      return [{ sourceKind: 'player', sourceId: id, heroClass, ...weeklyProfile(previous) }]
    }
    const draft = draftById.get(id)
    if (draft?.season === season) {
      return [{ sourceKind: 'player', sourceId: id, heroClass, ppg: null, draft: { round: draft.round, pick: draft.pick } }]
    }
    return [] // Veterans with too little recent data are left out of the MVP pool.
  })

  const defenseLines = await DefenseWeekStatModel.find({ season: season - 1, seasonType: 'REG' }, 'team stats').lean()
  const defenseWeeks = new Map<string, number[]>()
  for (const line of defenseLines) {
    const weeks = defenseWeeks.get(line.team) ?? []
    weeks.push(scoreDefense(line.stats, ruleset))
    defenseWeeks.set(line.team, weeks)
  }
  const defenses = [...defenseWeeks].map(([team, weeks]): PoolCandidate => ({
    sourceKind: 'defense',
    sourceId: team,
    heroClass: 'Paladin',
    ...weeklyProfile(weeks)
  }))

  return [...offense, ...defenses]
}

/** Points per game plus the two signals behind traits: week-to-week swing and best single week. */
export function weeklyProfile(weeks: readonly number[]): { ppg: number; volatility: number; ceiling: number } {
  const ppg = weeks.reduce((sum, value) => sum + value, 0) / weeks.length
  const spread = Math.sqrt(weeks.reduce((sum, value) => sum + (value - ppg) ** 2, 0) / weeks.length)
  // Swing relative to the hero's own average, so high scorers aren't automatically "wild".
  const volatility = spread / Math.max(1, Math.abs(ppg))
  return { ppg, volatility, ceiling: Math.max(...weeks) }
}
