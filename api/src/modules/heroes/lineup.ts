import { FIXED_SLOTS, FLEX_CLASSES, type HeroClass } from './classes.js'

export const LINEUP_SLOTS = ['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin', 'Flex'] as const
export type LineupSlot = (typeof LINEUP_SLOTS)[number]
export type Lineup = Record<LineupSlot, string>

export interface LineupHero {
  id: string
  heroClass: HeroClass
  value: number
}

export interface SwapCandidate extends LineupHero {
  resting: boolean
}

/**
 * Auto-swap plan for one week: for each starting slot whose hero is resting, the highest-Level
 * bench hero who isn't resting and fits the slot. Required slots are filled before FLEX, and each
 * bench hero swaps in at most once. Chooses by Level, never by that week's actual points.
 */
export function planAutoSwaps(
  lineup: Lineup,
  restingStarters: ReadonlySet<string>,
  bench: readonly SwapCandidate[]
): Map<LineupSlot, string> {
  const available = bench
    .filter(hero => !hero.resting)
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
  const used = new Set<string>()
  const swaps = new Map<LineupSlot, string>()
  for (const slot of LINEUP_SLOTS) {
    if (!restingStarters.has(lineup[slot])) continue
    const eligible: readonly HeroClass[] = slot === 'Flex' ? FLEX_CLASSES : [slot]
    const sub = available.find(hero => !used.has(hero.id) && eligible.includes(hero.heroClass))
    if (!sub) continue
    used.add(sub.id)
    swaps.set(slot, sub.id)
  }
  return swaps
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
