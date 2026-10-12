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
  const lastSeason = new Map<string, { games: number; points: number }>()
  for (const line of lastSeasonLines) {
    const total = lastSeason.get(line.playerId) ?? { games: 0, points: 0 }
    total.games++
    total.points += scoreOffense(line.stats, ruleset)
    lastSeason.set(line.playerId, total)
  }
  const draftById = new Map(players.map(player => [player._id, player.draft]))

  const offense = ids.flatMap((id): PoolCandidate[] => {
    const position = positionById.get(id)
    if (!position) return []
    const heroClass = CLASS_BY_POSITION[position]
    const previous = lastSeason.get(id)
    if (previous && previous.games >= MIN_PREVIOUS_GAMES) {
      return [{ sourceKind: 'player', sourceId: id, heroClass, ppg: previous.points / previous.games }]
    }
    const draft = draftById.get(id)
    if (draft?.season === season) {
      return [{ sourceKind: 'player', sourceId: id, heroClass, ppg: null, draft: { round: draft.round, pick: draft.pick } }]
    }
    return [] // Veterans with too little recent data are left out of the MVP pool.
  })

  const defenseLines = await DefenseWeekStatModel.find({ season: season - 1, seasonType: 'REG' }, 'team stats').lean()
  const defenseTotals = new Map<string, { games: number; points: number }>()
  for (const line of defenseLines) {
    const total = defenseTotals.get(line.team) ?? { games: 0, points: 0 }
    total.games++
    total.points += scoreDefense(line.stats, ruleset)
    defenseTotals.set(line.team, total)
  }
  const defenses = [...defenseTotals].map(([team, total]): PoolCandidate => ({
    sourceKind: 'defense',
    sourceId: team,
    heroClass: 'Paladin',
    ppg: total.points / total.games
  }))

  return [...offense, ...defenses]
}
