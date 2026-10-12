import { FIXED_SLOTS, FLEX_CLASSES, type HeroClass } from './classes.js'

export const LINEUP_SLOTS = ['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin', 'Flex'] as const
export type LineupSlot = (typeof LINEUP_SLOTS)[number]
export type Lineup = Record<LineupSlot, string>

export interface LineupHero {
  id: string
  heroClass: HeroClass
  value: number
}

/** Best hero per required slot by Level, then the best remaining FLEX-eligible hero. */
export function autoLineup(heroes: readonly LineupHero[]): Lineup {
  const best = [...heroes].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
  const used = new Set<string>()
  const take = (eligible: readonly HeroClass[], slot: LineupSlot) => {
    const hero = best.find(candidate => !used.has(candidate.id) && eligible.includes(candidate.heroClass))
    if (!hero) throw new Error(`Roster cannot fill the ${slot} slot`)
    used.add(hero.id)
    return hero.id
  }
  const lineup: Partial<Lineup> = {}
  for (const heroClass of FIXED_SLOTS) lineup[heroClass] = take([heroClass], heroClass)
  lineup.Flex = take(FLEX_CLASSES, 'Flex')
  return lineup as Lineup
}
