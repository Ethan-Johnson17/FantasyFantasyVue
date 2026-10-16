import type { HeroClass } from '../heroes/classes.js'

/**
 * Game rulesets: scoring, lineup shape, and pool size. A league records the version it started with, so tuning a ruleset
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

export interface SlotRule {
  /** Stable id used in lineups and results */
  key: string
  /** Shown to players */
  label: string
  /** Classes that may fill this slot */
  classes: readonly HeroClass[]
}

export interface LineupRules {
  /** Heroes each party drafts */
  rosterSize: number
  /** Starting slots; heroes not in a slot are on the bench */
  slots: readonly SlotRule[]
  /** Damage multiplier per class, applied to a hero's points */
  classMultipliers: Readonly<Record<HeroClass, number>>
  /** Share of points a bench hero scores when auto-swapped in for a resting starter */
  autoSwapMultiplier: number
}

export interface PoolRules {
  /** Hero pool size per party, by class */
  perParty: Readonly<Record<HeroClass, number>>
}

/** Weekly Champion and trait synergies. Rules: docs/CLASSIC_SCORING.md, "Strategy layer". */
export interface StrategyRules {
  /** A named Champion's damage multiplier */
  championMultiplier: number
  /** Mighty Champion: replaces championMultiplier when the Champion is Mighty */
  mightyChampionMultiplier: number
  /** Order & Chaos: bonus to the party total when Steadfast and Wild heroes both fight */
  orderAndChaosBonus: number
  /** Bulwark: a Wild Champion with a Steadfast ally deals at least this much */
  bulwarkFloor: number
}

export interface Ruleset {
  readonly version: number
  readonly offense: Readonly<OffenseRules>
  readonly defense: Readonly<DefenseRules>
  readonly lineup: Readonly<LineupRules>
  readonly pool: Readonly<PoolRules>
  readonly strategy: Readonly<StrategyRules>
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
    rosterSize: 10,
    // Classic: five open slots, any class (decided 2026-10-13)
    slots: [1, 2, 3, 4, 5].map(n => ({
      key: `slot${String(n)}`,
      label: `Hero ${String(n)}`,
      classes: ['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin'] as const
    })),
    // Calibrated on 2012-2025 pools so a hero's Level means similar damage in every class
    // (Level 6-8 heroes average ~17-18 damage per game in each). Rogues and Paladins stay swingier
    // week to week by design.
    classMultipliers: { Mage: 1, Warrior: 1.45, Ranger: 1.4, Rogue: 2.05, Paladin: 2.35 },
    autoSwapMultiplier: 0.5
  },
  pool: {
    // About 2.3x what a roster of 10 needs
    perParty: { Mage: 4, Warrior: 6, Ranger: 6, Rogue: 4, Paladin: 3 }
  },
  // Calibrated on 2012-2025 (decided 2026-10-15): each trait plan beats Level-only drafting by
  // 3-6 points of win rate, combining them reaches ~57%, and no plan runs away.
  strategy: { championMultiplier: 1.25, mightyChampionMultiplier: 1.5, orderAndChaosBonus: 0.05, bulwarkFloor: 15 }
}

const RULESETS = new Map<number, Ruleset>([[RULESET_V1.version, RULESET_V1]])

export const CURRENT_RULESET_VERSION = RULESET_V1.version

export function getRuleset(version: number): Ruleset {
  const ruleset = RULESETS.get(version)
  if (!ruleset) throw new Error(`Unknown scoring ruleset version: ${String(version)}`)
  return ruleset
}
