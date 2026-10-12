import type { Ruleset } from './rulesets.js'

/** Raw weekly stats for an offensive player (QB / RB / WR / TE). Missing stats count as 0. */
export interface OffenseStatLine {
  passingYards: number
  passingTds: number
  interceptions: number
  rushingYards: number
  rushingTds: number
  receptions: number
  receivingYards: number
  receivingTds: number
  twoPointConversions: number
  fumblesLost: number
  specialTeamsTds: number
  fumbleRecoveryTds: number
}

/** Raw weekly stats for a team defense. */
export interface DefenseStatLine {
  sacks: number
  interceptions: number
  fumbleRecoveries: number
  touchdowns: number
  safeties: number
  blockedKicks: number
  pointsAllowed: number
}

// Points are summed in hundredths so results are exact (e.g. 152 * 0.1 is 15.2, not 15.200000000000001).
const toHundredths = (count: number, pointsEach: number) => Math.round(count * pointsEach * 100)
const fromHundredths = (hundredths: number) => hundredths / 100

export function scoreOffense(stats: OffenseStatLine, ruleset: Ruleset): number {
  const rules = ruleset.offense
  return fromHundredths(
    toHundredths(stats.passingYards, rules.passingYard) +
      toHundredths(stats.passingTds, rules.passingTd) +
      toHundredths(stats.interceptions, rules.interception) +
      toHundredths(stats.rushingYards, rules.rushingYard) +
      toHundredths(stats.rushingTds, rules.rushingTd) +
      toHundredths(stats.receptions, rules.reception) +
      toHundredths(stats.receivingYards, rules.receivingYard) +
      toHundredths(stats.receivingTds, rules.receivingTd) +
      toHundredths(stats.twoPointConversions, rules.twoPointConversion) +
      toHundredths(stats.fumblesLost, rules.fumbleLost) +
      toHundredths(stats.specialTeamsTds, rules.specialTeamsTd) +
      toHundredths(stats.fumbleRecoveryTds, rules.fumbleRecoveryTd)
  )
}

export function scoreDefense(stats: DefenseStatLine, ruleset: Ruleset): number {
  const rules = ruleset.defense
  return fromHundredths(
    toHundredths(stats.sacks, rules.sack) +
      toHundredths(stats.interceptions, rules.interception) +
      toHundredths(stats.fumbleRecoveries, rules.fumbleRecovery) +
      toHundredths(stats.touchdowns, rules.touchdown) +
      toHundredths(stats.safeties, rules.safety) +
      toHundredths(stats.blockedKicks, rules.blockedKick) +
      toHundredths(1, pointsAllowedScore(stats.pointsAllowed, ruleset))
  )
}

export function pointsAllowedScore(pointsAllowed: number, ruleset: Ruleset): number {
  const tier = ruleset.defense.pointsAllowedTiers.find(t => pointsAllowed <= t.maxAllowed)
  if (!tier) throw new Error(`No points-allowed tier covers ${String(pointsAllowed)}`)
  return tier.points
}
