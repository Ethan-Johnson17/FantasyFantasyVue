import type { Rng } from '../../lib/random.js'
import { CLASS_TRAITS } from './classes.js'
import { generateName, type Gender } from './names.js'
import type { PoolEntry } from './pool.js'

export interface HeroAppearance {
  name: string
  race: string
  gender: Gender
  weapon: string
  skill: string
  attack: number
  defense: number
  magic: number
}

/** The original generator's stat roll: 1, 2, or 3, with 2 twice as likely. */
const statRoll = (rng: Rng) => Math.round(rng.next() * 2) + 1

/** Gives each pool entry a fantasy identity. Names are unique within the pool. */
export function generateAppearances(entries: readonly PoolEntry[], rng: Rng): (PoolEntry & HeroAppearance)[] {
  const usedNames = new Set<string>()
  return entries.map(entry => {
    const traits = CLASS_TRAITS[entry.heroClass]
    const gender: Gender = rng.chance(traits.maleShare) ? 'male' : 'female'
    return {
      ...entry,
      name: generateName(rng, gender, usedNames),
      race: rng.pick(traits.races),
      gender,
      weapon: traits.weapon,
      skill: traits.skill,
      attack: traits.base.attack + statRoll(rng),
      defense: traits.base.defense + statRoll(rng),
      magic: traits.base.magic + statRoll(rng)
    }
  })
}
