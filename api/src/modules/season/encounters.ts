import type { HeroClass } from '../heroes/classes.js'
import { createRng } from '../../lib/random.js'
import type { QuestRules } from '../scoring/rulesets.js'

/*
 * Crossover's weekly encounters (docs/CROSSOVER_SPEC.md, "Quest"). Each is weak to two classes and resists one.
 * The ten cover every pair of classes once, and each class is resisted by exactly two, so no class is favored over
 * a season.
 */

export interface Encounter {
  name: string
  weak: readonly [HeroClass, HeroClass]
  resists: HeroClass
}

export const ENCOUNTERS: readonly Encounter[] = [
  { name: 'Bone Hydra', weak: ['Mage', 'Warrior'], resists: 'Paladin' },
  { name: 'Frost Wyrm', weak: ['Mage', 'Ranger'], resists: 'Rogue' },
  { name: 'Gelatinous Cube', weak: ['Mage', 'Rogue'], resists: 'Warrior' },
  { name: 'Lich of the Barrow', weak: ['Mage', 'Paladin'], resists: 'Ranger' },
  { name: 'Owlbear', weak: ['Warrior', 'Ranger'], resists: 'Mage' },
  { name: 'Basilisk', weak: ['Warrior', 'Rogue'], resists: 'Paladin' },
  { name: 'Shadow Drake', weak: ['Warrior', 'Paladin'], resists: 'Rogue' },
  { name: 'Minotaur Warlord', weak: ['Ranger', 'Rogue'], resists: 'Mage' },
  { name: 'Swamp Hag', weak: ['Ranger', 'Paladin'], resists: 'Warrior' },
  { name: 'Iron Golem', weak: ['Rogue', 'Paladin'], resists: 'Ranger' }
]

/**
 * The league's encounter for a game week: the ten in an order shuffled from the league seed, so every encounter
 * comes up before any repeats. Known ahead of time, so parties can plan for it.
 */
export function encounterFor(seed: string, week: number): Encounter {
  const order = createRng(seed, 'encounters').shuffle(ENCOUNTERS)
  const encounter = order[(week - 1) % order.length]
  if (!encounter) throw new Error('No encounters defined')
  return encounter
}

/** An encounter's multiplier for a class: weak, resisted, or neither. */
export function encounterMultiplier(encounter: Encounter, heroClass: HeroClass, rules: QuestRules): number {
  if (encounter.weak.includes(heroClass)) return rules.weakMultiplier
  if (encounter.resists === heroClass) return rules.resistMultiplier
  return 1
}
