/**
 * Scoring rulesets. A league records the version it started with, so tuning a ruleset
 * means adding a new version, never editing an existing one.
 * Spec: docs/CLASSIC_SCORING.md
 */

export interface OffenseRules {
  passingYard: number
  passingTd: number
  interception: number
  rushingYard: number
  rushingTd: number
  receivingYard: number
  receivingTd: number
  reception: number
  twoPointConversion: number
  fumbleLost: number
  specialTeamsTd: number
  /** An offensive player recovering a fumble (their own or a teammate's) in the end zone */
  fumbleRecoveryTd: number
}

export interface DefenseRules {
  sack: number
  interception: number
  fumbleRecovery: number
  touchdown: number
  safety: number
  blockedKick: number
  /** Ordered tiers; the first tier whose `maxAllowed` is >= points allowed applies. */
  pointsAllowedTiers: readonly { maxAllowed: number; points: number }[]
}

export interface LineupRules {
  /** Share of points a bench hero scores when auto-swapped in for a resting starter */
  autoSwapMultiplier: number
}

export interface Ruleset {
  readonly version: number
  readonly offense: Readonly<OffenseRules>
  readonly defense: Readonly<DefenseRules>
  readonly lineup: Readonly<LineupRules>
}

export const RULESET_V1: Ruleset = {
  version: 1,
  offense: {
    passingYard: 0.04,
    passingTd: 4,
    interception: -2,
    rushingYard: 0.1,
    rushingTd: 6,
    receivingYard: 0.1,
    receivingTd: 6,
    reception: 0.5,
    twoPointConversion: 2,
    fumbleLost: -2,
    specialTeamsTd: 6,
    fumbleRecoveryTd: 6
  },
  defense: {
    sack: 1,
    interception: 2,
    fumbleRecovery: 2,
    touchdown: 6,
    safety: 2,
    blockedKick: 2,
    pointsAllowedTiers: [
      { maxAllowed: 0, points: 10 },
      { maxAllowed: 6, points: 7 },
      { maxAllowed: 13, points: 4 },
      { maxAllowed: 20, points: 1 },
      { maxAllowed: 27, points: 0 },
      { maxAllowed: 34, points: -1 },
      { maxAllowed: Infinity, points: -4 }
    ]
  },
  lineup: {
    autoSwapMultiplier: 0.5
  }
}

const RULESETS = new Map<number, Ruleset>([[RULESET_V1.version, RULESET_V1]])

export const CURRENT_RULESET_VERSION = RULESET_V1.version

export function getRuleset(version: number): Ruleset {
  const ruleset = RULESETS.get(version)
  if (!ruleset) throw new Error(`Unknown scoring ruleset version: ${String(version)}`)
  return ruleset
}
