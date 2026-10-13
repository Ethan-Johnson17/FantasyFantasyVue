import type { Rng } from '../../lib/random.js'
import type { HeroClass } from '../heroes/classes.js'
import { maxFillableSlots } from '../heroes/lineup.js'
import type { LineupRules, SlotRule } from '../scoring/rulesets.js'

/*
 * Automatic snake draft. Pure: parties, rankings, pool, and lineup rules in; picks out.
 *
 * Fairness invariant: for every class with dedicated slots (slots only that class can fill), the
 * heroes still available are never fewer than the dedicated slots other parties still need to fill
 * with it. Each pick preserves it, so every roster can always be completed. Multi-class slots draw
 * from a pool far larger than demand, so they need no protection.
 */

export type DraftRules = Pick<LineupRules, 'rosterSize' | 'slots'>

export interface DraftHero {
  id: string
  heroClass: HeroClass
  /** Fallback ordering when a party's ranking has nothing usable: Level or mystery midpoint */
  value: number
}

export interface DraftParty {
  id: string
  /** Hero ids, best first. May be partial or empty. */
  ranking: readonly string[]
}

export interface DraftPick {
  round: number
  /** 1-based pick number across the whole draft */
  overall: number
  partyId: string
  heroId: string
}

export interface DraftResult {
  order: string[]
  picks: DraftPick[]
}

/** Lineup slots a roster still can't fill. */
export function slotsStillNeeded(roster: readonly HeroClass[], slots: readonly SlotRule[]): number {
  return slots.length - maxFillableSlots(roster, slots)
}

/** Slots that only this class can fill. */
function dedicatedSlots(heroClass: HeroClass, slots: readonly SlotRule[]): number {
  return slots.filter(slot => slot.classes.length === 1 && slot.classes[0] === heroClass).length
}

export function runSnakeDraft(
  parties: readonly DraftParty[],
  heroes: readonly DraftHero[],
  rng: Rng,
  rules: DraftRules
): DraftResult {
  const order = rng.shuffle(parties.map(party => party.id))
  const rankings = new Map(parties.map(party => [party.id, party.ranking]))
  const rosters = new Map(parties.map(party => [party.id, [] as HeroClass[]]))
  const available = new Map(heroes.map(hero => [hero.id, hero]))
  const byValue = [...heroes].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
  const picks: DraftPick[] = []

  for (let round = 1; round <= rules.rosterSize; round++) {
    const turnOrder = round % 2 === 1 ? order : [...order].reverse()
    for (const partyId of turnOrder) {
      const roster = rosters.get(partyId) ?? []
      const allowed = (hero: DraftHero) => isAllowed(hero.heroClass, partyId, roster, rosters, available, rules)
      const ranked = (rankings.get(partyId) ?? []).map(id => available.get(id)).find(hero => hero && allowed(hero))
      const choice = ranked ?? byValue.find(hero => available.has(hero.id) && allowed(hero))
      if (!choice) throw new Error(`No valid pick for party ${partyId} in round ${String(round)}`)

      available.delete(choice.id)
      roster.push(choice.heroClass)
      picks.push({ round, overall: picks.length + 1, partyId, heroId: choice.id })
    }
  }
  return { order, picks }
}

function isAllowed(
  heroClass: HeroClass,
  partyId: string,
  roster: readonly HeroClass[],
  rosters: ReadonlyMap<string, readonly HeroClass[]>,
  available: ReadonlyMap<string, DraftHero>,
  rules: DraftRules
): boolean {
  const picksLeftAfter = rules.rosterSize - roster.length - 1
  if (slotsStillNeeded([...roster, heroClass], rules.slots) > picksLeftAfter) return false

  // Beyond its own dedicated slots, a party may only take this class if enough remain for others' dedicated slots.
  const dedicated = dedicatedSlots(heroClass, rules.slots)
  const owned = roster.filter(owned => owned === heroClass).length
  if (dedicated > 0 && owned >= dedicated) {
    const othersNeed = [...rosters]
      .filter(([id]) => id !== partyId)
      .reduce((sum, [, other]) => sum + Math.max(0, dedicated - other.filter(c => c === heroClass).length), 0)
    const remaining = [...available.values()].filter(hero => hero.heroClass === heroClass).length
    if (remaining - 1 < othersNeed) return false
  }
  return true
}
