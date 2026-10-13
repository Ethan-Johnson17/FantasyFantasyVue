import type { SlotRule } from '../scoring/rulesets.js'
import type { HeroClass } from './classes.js'

/*
 * Lineup logic driven by a ruleset's slot definitions, so any lineup shape (fixed positions,
 * FLEX, fully open slots) uses the same code.
 */

/** Hero id by slot key */
export type Lineup = Record<string, string>

export interface LineupHero {
  id: string
  heroClass: HeroClass
  value: number
}

export interface SwapCandidate extends LineupHero {
  resting: boolean
}

const accepts = (slot: SlotRule, heroClass: HeroClass) => slot.classes.includes(heroClass)

/** Most restrictive slots first, so specialists aren't used up by open slots. */
export function bySpecificity(slots: readonly SlotRule[]): SlotRule[] {
  return [...slots].sort((a, b) => a.classes.length - b.classes.length)
}

const byValue = <T extends LineupHero>(heroes: readonly T[]) =>
  [...heroes].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))

/**
 * The most slots a roster could fill at once (maximum bipartite matching of heroes to slots
 * they're eligible for). Rosters and lineups are tiny, so simple augmenting paths are plenty.
 */
export function maxFillableSlots(roster: readonly HeroClass[], slots: readonly SlotRule[]): number {
  const heroForSlot = new Array<number>(slots.length).fill(-1)
  const tryAssign = (hero: number, visited: boolean[]): boolean => {
    const heroClass = roster[hero]
    if (heroClass === undefined) return false
    for (let slot = 0; slot < slots.length; slot++) {
      const rule = slots[slot]
      if (!rule || visited[slot] || !accepts(rule, heroClass)) continue
      visited[slot] = true
      const current = heroForSlot[slot] ?? -1
      if (current === -1 || tryAssign(current, visited)) {
        heroForSlot[slot] = hero
        return true
      }
    }
    return false
  }
  let filled = 0
  for (let hero = 0; hero < roster.length; hero++) {
    if (tryAssign(hero, new Array<boolean>(slots.length).fill(false))) filled++
  }
  return filled
}

/** Fills each slot with the highest-value eligible hero, most restrictive slots first. */
export function autoLineup(heroes: readonly LineupHero[], slots: readonly SlotRule[]): Lineup {
  const best = byValue(heroes)
  const used = new Set<string>()
  const lineup: Lineup = {}
  for (const slot of bySpecificity(slots)) {
    const hero = best.find(candidate => !used.has(candidate.id) && accepts(slot, candidate.heroClass))
    if (!hero) throw new Error(`Roster cannot fill the ${slot.label} slot`)
    used.add(hero.id)
    lineup[slot.key] = hero.id
  }
  return lineup
}

/** Checks a submitted lineup: exactly the ruleset's slots, distinct heroes, each eligible for its slot. */
export function validateLineup(
  lineup: Lineup,
  slots: readonly SlotRule[],
  classOf: (heroId: string) => HeroClass | undefined
): string | null {
  const keys = Object.keys(lineup)
  if (keys.length !== slots.length || slots.some(slot => !(slot.key in lineup))) {
    return `Lineups must fill exactly these slots: ${slots.map(slot => slot.key).join(', ')}`
  }
  const ids = Object.values(lineup)
  if (new Set(ids).size !== ids.length) return 'Each hero can only fill one slot'
  for (const slot of slots) {
    const heroClass = classOf(lineup[slot.key] ?? '')
    if (!heroClass) return `The ${slot.label} slot must be a hero in your party`
    if (!accepts(slot, heroClass)) return `A ${heroClass} cannot fill the ${slot.label} slot`
  }
  return null
}

/**
 * Auto-swap plan for one week: for each slot whose starter is resting, the highest-Level bench
 * hero who isn't resting and fits the slot. Restrictive slots are filled first, and each bench hero
 * swaps in at most once. Chooses by Level, never by that week's actual points.
 */
export function planAutoSwaps(
  lineup: Lineup,
  slots: readonly SlotRule[],
  restingStarters: ReadonlySet<string>,
  bench: readonly SwapCandidate[]
): Map<string, string> {
  const available = byValue(bench.filter(hero => !hero.resting))
  const used = new Set<string>()
  const swaps = new Map<string, string>()
  for (const slot of bySpecificity(slots)) {
    if (!restingStarters.has(lineup[slot.key] ?? '')) continue
    const sub = available.find(hero => !used.has(hero.id) && accepts(slot, hero.heroClass))
    if (!sub) continue
    used.add(sub.id)
    swaps.set(slot.key, sub.id)
  }
  return swaps
}
