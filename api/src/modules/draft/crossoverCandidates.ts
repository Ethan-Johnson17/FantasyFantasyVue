import mongoose from 'mongoose'
import { CLASS_BY_POSITION, type HeroClass } from '../heroes/classes.js'
import type { PoolCandidate } from '../heroes/pool.js'
import type { Ruleset } from '../scoring/rulesets.js'
import { scoreDefense, scoreOffense } from '../scoring/scoring.js'
import { projectDamage } from '../season/form.service.js'
import { teamName } from '../stats/teams.js'
import { DefenseWeekStatModel, NflPlayerModel, PlayerWeekStatModel } from '../stats/stats.models.js'
import { MIN_PREVIOUS_GAMES, weeklyProfile } from './candidates.js'

/*
 * Crossover's hero pool: real players from the season being played, shown openly.
 * Rules: docs/CROSSOVER_SPEC.md, "Pool and draft".
 */

const { trusted } = mongoose

/** The real player shown with a Crossover hero */
export interface PlayerCard {
  name: string
  team: string
  position: string
}

export interface CrossoverCandidates {
  candidates: PoolCandidate[]
  /** Who each candidate is, by source id */
  cards: Map<string, PlayerCard>
}

/**
 * Everyone who has played this season, ranked by this season's points blended with a prior worth 3 games
 * (the same blend as projections, backtested in Classic): last season's points per game if they played
 * MIN_PREVIOUS_GAMES, otherwise what a Level 1 hero of their class scores. A one-game fluke stays low; a
 * breakout season rises week by week. Traits come from last season's weeks, so players without one have
 * none. No mystery recruits: Crossover rookies are known players, ranked by how they've played.
 */
export async function loadCrossoverCandidates(season: number, ruleset: Ruleset): Promise<CrossoverCandidates> {
  const [thisSeason, defenseLines] = await Promise.all([
    PlayerWeekStatModel.find({ season, seasonType: 'REG' }, 'playerId position team week stats').sort({ week: 1 }).lean(),
    DefenseWeekStatModel.find({ season: trusted({ $in: [season, season - 1] }), seasonType: 'REG' }, 'team season stats').lean()
  ])
  const current = new Map<string, { position: keyof typeof CLASS_BY_POSITION; team: string; points: number[] }>()
  for (const line of thisSeason) {
    const entry = current.get(line.playerId) ?? { position: line.position, team: line.team, points: [] }
    // The latest game decides the team and position, so a traded player shows their new team.
    entry.position = line.position
    entry.team = line.team
    entry.points.push(scoreOffense(line.stats, ruleset))
    current.set(line.playerId, entry)
  }
  const ids = [...current.keys()]
  const [lastSeasonLines, players] = await Promise.all([
    PlayerWeekStatModel.find({ season: season - 1, seasonType: 'REG', playerId: trusted({ $in: ids }) }, 'playerId stats').lean(),
    NflPlayerModel.find({ _id: trusted({ $in: ids }) }, 'name').lean()
  ])
  const lastSeason = new Map<string, number[]>()
  for (const line of lastSeasonLines) {
    const weeks = lastSeason.get(line.playerId) ?? []
    weeks.push(scoreOffense(line.stats, ruleset))
    lastSeason.set(line.playerId, weeks)
  }
  const nameById = new Map(players.map(player => [player._id, player.name]))

  const candidates: PoolCandidate[] = []
  const cards = new Map<string, PlayerCard>()
  for (const [id, { position, team, points }] of current) {
    const name = nameById.get(id)
    if (!name) continue
    const heroClass = CLASS_BY_POSITION[position]
    candidates.push({ sourceKind: 'player', sourceId: id, heroClass, ...ranking(points, lastSeason.get(id), levelOnePoints(heroClass, ruleset)) })
    cards.set(id, { name, team, position })
  }

  const defenseWeeks = (forSeason: number) => {
    const byTeam = new Map<string, number[]>()
    for (const line of defenseLines.filter(row => row.season === forSeason)) {
      byTeam.set(line.team, [...(byTeam.get(line.team) ?? []), scoreDefense(line.stats, ruleset)])
    }
    return byTeam
  }
  const lastSeasonDefense = defenseWeeks(season - 1)
  for (const [team, points] of defenseWeeks(season)) {
    const prior = levelOnePoints('Paladin', ruleset)
    candidates.push({ sourceKind: 'defense', sourceId: team, heroClass: 'Paladin', ...ranking(points, lastSeasonDefense.get(team), prior) })
    cards.set(team, { name: teamName(team), team, position: 'DEF' })
  }
  return { candidates, cards }
}

/** Points a Level 1 hero of the class scores in a typical week: the prior for players without a last season. */
export function levelOnePoints(heroClass: HeroClass, ruleset: Ruleset): number {
  return (ruleset.levelDamage[heroClass][0] ?? 0) / ruleset.lineup.classMultipliers[heroClass]
}

function ranking(
  current: readonly number[],
  previous: readonly number[] | undefined,
  newcomerPrior: number
): Pick<PoolCandidate, 'ppg' | 'volatility' | 'ceiling'> {
  const profile = previous !== undefined && previous.length >= MIN_PREVIOUS_GAMES ? weeklyProfile(previous) : null
  const ppg = projectDamage(current, profile ? profile.ppg : newcomerPrior)
  return { ppg, ...(profile ? { volatility: profile.volatility, ceiling: profile.ceiling } : {}) }
}
