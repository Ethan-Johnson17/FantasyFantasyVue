import type { HeroClass } from '../heroes/classes.js'
import type { LeagueMode } from '../leagues/league.model.js'

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
  /** Most heroes of a class one party may hold, in the draft and through free agency */
  classLimits: Readonly<Partial<Record<HeroClass, number>>>
}

export interface PoolRules {
  /** Hero pool size per party, by class (capped at the candidates a season has, for big leagues) */
  perParty: Readonly<Record<HeroClass, number>>
  /** The whole pool must offer at least this many heroes per party, so every party has real choices */
  minPerParty: number
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

/** Natural 20 / natural 1 thresholds: class damage per week (points x class multiplier). */
export interface CritRules {
  /** At or above: a critical success */
  success: Readonly<Record<HeroClass, number>>
  /** At or below: a critical fail */
  fail: Readonly<Record<HeroClass, number>>
}

/**
 * Crossover's Quest board (docs/CROSSOVER_SPEC.md): class damage against the week's encounter, where natural
 * 20s and natural 1s count. Classic has no Quest: its crits are flavor only.
 */
export interface QuestRules {
  /** Heroes in the Quest party, any class, picked from the whole roster (football starters included) */
  partySize: number
  /** Damage multiplier for a class the encounter is weak to */
  weakMultiplier: number
  /** Damage multiplier for the class the encounter resists */
  resistMultiplier: number
  /** A natural 20's damage multiplier */
  natural20Multiplier: number
  /** A natural 1's damage multiplier */
  natural1Multiplier: number
}

/**
 * Co-op's campaign (docs/COOP_SPEC.md): every party's damage goes to one shared monster per chapter. HP is
 * parties x partyDamage[parties] x seasonFactors[season] x weeks in the chapter's window x the chapter or boss factor,
 * varied by up to +/- hpVariation from the league seed.
 */
export interface CoopRules {
  /** The last game week each chapter's monster may fall by; the last chapter is the boss raid */
  deadlines: readonly number[]
  /** Missed deadlines the league survives: losing the last one ends the campaign */
  lives: number
  /** Damage multiplier for a class the monster is weak to */
  weakMultiplier: number
  /** Damage multiplier for the class the monster resists */
  resistMultiplier: number
  /** Expected plain damage per party per week, by league size (bigger leagues spread talent thinner) */
  partyDamage: Readonly<Record<number, number>>
  /** How high-scoring each hidden season was against the average; 1 for a season not listed. Server-only. */
  seasonFactors: Readonly<Record<number, number>>
  chapterFactor: number
  bossFactor: number
  /** Each monster's HP varies by up to this share, from the seed */
  hpVariation: number
}

/**
 * Solo (docs/SOLO_SPEC.md): one party, bought under a budget from the whole current-season pool, against a campaign
 * scaled to the weeks left. HP is the best buyable party's projected damage at the start x projectionScale x weeks in
 * the chapter's window x the chapter or boss factor, varied by up to +/- hpVariation from the run's seed.
 */
export interface SoloRules {
  /** A hero's price in gold by Level, Level 1 first */
  costs: readonly number[]
  /** Gold for the whole roster, at the prices paid */
  cap: number
  /** Swaps (release one hero, sign another) per NFL week; unused swaps don't carry over */
  swapsPerWeek: number
  /** A run starts no earlier than this NFL week: the pool needs a played week */
  firstWeek: number
  /** Runs play through this NFL week */
  lastWeek: number
  /** Weeks a run needs, from its first through lastWeek */
  minWeeks: number
  /** Monsters in the campaign; the last is the boss */
  chapters: number
  /** Missed deadlines the run survives: losing the last one ends it */
  lives: number
  /** Damage multiplier for a class the monster is weak to */
  weakMultiplier: number
  /** Damage multiplier for the class the monster resists */
  resistMultiplier: number
  /** Turns the best party's projection into what such a party deals (Champion, synergies, crits) */
  projectionScale: number
  /** A bench spot's worth against a fighter's 1 when finding the best party: it only covers byes */
  benchWeight: number
  chapterFactor: number
  bossFactor: number
  /** Each monster's HP varies by up to this share, from the seed */
  hpVariation: number
}

export interface Ruleset {
  readonly version: number
  /** The game mode this ruleset is for; a league's mode and ruleset always match */
  readonly mode: LeagueMode
  readonly offense: Readonly<OffenseRules>
  readonly defense: Readonly<DefenseRules>
  readonly lineup: Readonly<LineupRules>
  readonly pool: Readonly<PoolRules>
  readonly strategy: Readonly<StrategyRules>
  readonly crits: Readonly<CritRules>
  /** Crossover only: the Quest board. Its presence means two scoreboards. */
  readonly quest?: Readonly<QuestRules>
  /** Co-op only: the campaign against shared monsters, instead of matchups between parties */
  readonly coop?: Readonly<CoopRules>
  /** Solo only: the budget, swaps and the campaign scaled to the weeks left */
  readonly solo?: Readonly<SoloRules>
  /**
   * Average class damage per battle at Level 1..10, by class: what a Level is worth. Turns a mystery recruit's
   * damage into a "playing like Lv X" estimate.
   */
  readonly levelDamage: Readonly<Record<HeroClass, readonly number[]>>
}

export const RULESET_V1: Ruleset = {
  version: 1,
  mode: 'classic',
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
    autoSwapMultiplier: 0.5,
    // Team defenses are scarce (32 a season), so no party can corner them (decided 2026-10-19).
    classLimits: { Paladin: 2 }
  },
  pool: {
    // About 2.3x what a roster of 10 needs
    perParty: { Mage: 4, Warrior: 6, Ranger: 6, Rogue: 4, Paladin: 3 },
    // 1.5 heroes per roster spot. Big leagues stay well above it (12 parties: about 22 per party).
    minPerParty: 15
  },
  // Calibrated on 2012-2025 (decided 2026-10-15): each trait plan beats Level-only drafting by
  // 3-6 points of win rate, combining them reaches ~57%, and no plan runs away.
  strategy: { championMultiplier: 1.25, mightyChampionMultiplier: 1.5, orderAndChaosBonus: 0.05, bulwarkFloor: 15 },
  // The top and bottom 5% of each class's hero-weeks in the 2012-2025 pools (decided 2026-10-16)
  crits: {
    success: { Mage: 31, Warrior: 39, Ranger: 37, Rogue: 42, Paladin: 45 },
    fail: { Mage: 3, Warrior: 2, Ranger: 2, Rogue: 0, Paladin: -2 }
  },
  // 6-party pools 2012-2025, veterans per played battle, smoothed so a higher Level never means less (2026-10-21)
  levelDamage: {
    Mage: [13.3, 14.7, 14.7, 16, 16.8, 16.8, 16.8, 18.7, 18.7, 20.3],
    Warrior: [12.8, 13, 13.2, 14.3, 16.9, 17.2, 17.3, 18.6, 19.6, 23.7],
    Ranger: [13, 14.3, 14.9, 15.1, 15.4, 16.7, 17, 18.3, 19.5, 20.1],
    Rogue: [12.1, 12.1, 13.7, 13.7, 14.9, 16.2, 17.3, 17.3, 19.7, 25.9],
    Paladin: [15, 15.4, 15.4, 16.4, 16.4, 17.8, 17.8, 17.8, 17.8, 18.9]
  }
}

const ANY_SKILL_POSITION = ['Warrior', 'Ranger', 'Rogue'] as const

/**
 * Crossover (docs/CROSSOVER_SPEC.md): real, current players in football positions. Scoring and the Champion
 * work as in Classic for now; encounters and the two scoreboards come in later build phases, so this version
 * may still change until Crossover leagues can be created (CROSSOVER_ENABLED).
 */
export const CROSSOVER_V1: Ruleset = {
  ...RULESET_V1,
  version: 2,
  mode: 'crossover',
  lineup: {
    ...RULESET_V1.lineup,
    rosterSize: 14,
    // QB, 2 RB, 2 WR, TE, FLEX, DEF (decided 2026-10-24). Classes follow positions: QB Mage, RB Warrior,
    // WR Ranger, TE Rogue, DEF Paladin.
    slots: [
      { key: 'qb', label: 'QB', classes: ['Mage'] },
      { key: 'rb1', label: 'RB', classes: ['Warrior'] },
      { key: 'rb2', label: 'RB', classes: ['Warrior'] },
      { key: 'wr1', label: 'WR', classes: ['Ranger'] },
      { key: 'wr2', label: 'WR', classes: ['Ranger'] },
      { key: 'te', label: 'TE', classes: ['Rogue'] },
      { key: 'flex', label: 'FLEX', classes: ANY_SKILL_POSITION },
      { key: 'def', label: 'DEF', classes: ['Paladin'] }
    ],
    // No auto-swap: each player locks at kickoff, so managers make their own swaps.
    autoSwapMultiplier: 0
  },
  pool: {
    // About 2.3x what a roster of 14 needs, weighted toward the positions a lineup uses most
    perParty: { Mage: 5, Warrior: 9, Ranger: 10, Rogue: 5, Paladin: 3 },
    // 1.5 heroes per roster spot, as in Classic
    minPerParty: 21
  },
  // Spec defaults; balanced by simulation before Crossover launches (docs/CROSSOVER_SPEC.md, "Quest").
  // Balanced on 2013-2025 (decided 2026-10-24): with a separate Quest party the boards split in 29% of matchups,
  // encounter-aware parties win 55% of Quests, and never naming a Champion drops to 41%.
  quest: { partySize: 5, weakMultiplier: 1.25, resistMultiplier: 0.75, natural20Multiplier: 1.25, natural1Multiplier: 0 }
}

/**
 * Co-op (docs/COOP_SPEC.md): Classic's hidden seasons, draft, lineup and strategy, with every party fighting the same
 * campaign monsters. Balanced with `npm run simulate:coop` on 2012-2025 (decided 2026-11-09): lineups by Level with
 * a Champion win 66% of campaigns, lineups set against each monster 93%, never naming a Champion 12%; 60-71% at
 * every league size and 49-73% in every season.
 */
export const COOP_V1: Ruleset = {
  ...RULESET_V1,
  version: 3,
  mode: 'coop',
  coop: {
    deadlines: [3, 6, 9, 12, 14],
    lives: 3,
    weakMultiplier: 1.25,
    resistMultiplier: 0.75,
    partyDamage: { 2: 110, 3: 109, 4: 105, 5: 104, 6: 102, 7: 100, 8: 99, 9: 97, 10: 96, 11: 94, 12: 93 },
    seasonFactors: {
      2012: 1.04, 2013: 1.03, 2014: 1.04, 2015: 0.96, 2016: 0.93, 2017: 0.93, 2018: 1.11,
      2019: 0.96, 2020: 0.98, 2021: 1, 2022: 1.08, 2023: 1.04, 2024: 0.92, 2025: 0.96
    },
    chapterFactor: 1,
    bossFactor: 1.25,
    hpVariation: 0.15
  }
}

/**
 * Solo (docs/SOLO_SPEC.md): Crossover's players, Quest damage and kickoff locks, a roster of 8 bought under a budget,
 * and Co-op's campaign for one party. Balanced with `npm run simulate:solo` on 2012-2025 (decided 2026-11-10): a
 * sensible build wins 68% of runs, two stars 69%, even fighters 64%, never naming a Champion 43%.
 */
export const SOLO_V1: Ruleset = {
  ...CROSSOVER_V1,
  version: 4,
  mode: 'solo',
  lineup: {
    ...CROSSOVER_V1.lineup,
    rosterSize: 8,
    // No football lineup: only the Quest party of 5 fights, the other 3 are the bench.
    slots: []
  },
  pool: {
    // The whole pool: every current-season player and defense who has played, Levels as deciles of each class.
    perParty: { Mage: Infinity, Warrior: Infinity, Ranger: Infinity, Rogue: Infinity, Paladin: Infinity },
    minPerParty: 8
  },
  solo: {
    // Level squared, 1 to 100 gold
    costs: [1, 4, 9, 16, 25, 36, 49, 64, 81, 100],
    cap: 116,
    swapsPerWeek: 2,
    firstWeek: 2,
    lastWeek: 17,
    minWeeks: 8,
    chapters: 5,
    lives: 3,
    weakMultiplier: 1.25,
    resistMultiplier: 0.75,
    projectionScale: 1.12,
    benchWeight: 0.35,
    chapterFactor: 1,
    bossFactor: 1,
    hpVariation: 0.15
  }
}

const RULESETS = new Map<number, Ruleset>([RULESET_V1, CROSSOVER_V1, COOP_V1, SOLO_V1].map(ruleset => [ruleset.version, ruleset]))

export const CURRENT_RULESET_VERSION = RULESET_V1.version
/** The ruleset new leagues of each mode start with */
export const RULESET_FOR_MODE: Readonly<Record<LeagueMode, number>> = {
  classic: RULESET_V1.version,
  crossover: CROSSOVER_V1.version,
  coop: COOP_V1.version,
  solo: SOLO_V1.version
}

export function getRuleset(version: number): Ruleset {
  const ruleset = RULESETS.get(version)
  if (!ruleset) throw new Error(`Unknown scoring ruleset version: ${String(version)}`)
  return ruleset
}
