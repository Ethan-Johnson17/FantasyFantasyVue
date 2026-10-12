import type { Rng } from '../../lib/random.js'
import { FIXED_SLOTS, FLEX_CLASSES, HERO_CLASSES, ROSTER_SIZE, type HeroClass } from '../heroes/classes.js'

/*
 * Automatic snake draft. Pure: parties, rankings, and pool in; picks out.
 *
 * Fairness invariant: for every class, the heroes still available are never fewer than the parties
 * still missing that class. Each pick preserves it, so every roster can always be completed.
 */

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

/** Lineup slots a roster still can't fill: missing required classes, plus FLEX if unfillable. */
export function slotsStillNeeded(roster: readonly HeroClass[]): number {
  const count = countByClass(roster)
  const missingFixed = FIXED_SLOTS.filter(heroClass => count[heroClass] === 0).length
  // Heroes beyond the first of a FLEX-eligible class can fill FLEX.
  const flexCandidates = FLEX_CLASSES.reduce((sum, heroClass) => sum + Math.max(0, count[heroClass] - 1), 0)
  return missingFixed + (flexCandidates > 0 ? 0 : 1)
}

export function runSnakeDraft(parties: readonly DraftParty[], heroes: readonly DraftHero[], rng: Rng): DraftResult {
  const order = rng.shuffle(parties.map(party => party.id))
  const rankings = new Map(parties.map(party => [party.id, party.ranking]))
  const rosters = new Map(parties.map(party => [party.id, [] as HeroClass[]]))
  const available = new Map(heroes.map(hero => [hero.id, hero]))
  const byValue = [...heroes].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
  const picks: DraftPick[] = []

  for (let round = 1; round <= ROSTER_SIZE; round++) {
    const turnOrder = round % 2 === 1 ? order : [...order].reverse()
    for (const partyId of turnOrder) {
      const roster = rosters.get(partyId) ?? []
      const allowed = (hero: DraftHero) => isAllowed(hero.heroClass, partyId, roster, rosters, available)
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
  available: ReadonlyMap<string, DraftHero>
): boolean {
  const picksLeftAfter = ROSTER_SIZE - roster.length - 1
  if (slotsStillNeeded([...roster, heroClass]) > picksLeftAfter) return false

  // A party that already has this class may only take another if enough remain for parties lacking it.
  if (roster.includes(heroClass)) {
    const othersLacking = [...rosters].filter(([id, other]) => id !== partyId && !other.includes(heroClass)).length
    const remaining = [...available.values()].filter(hero => hero.heroClass === heroClass).length
    if (remaining - 1 < othersLacking) return false
  }
  return true
}

function countByClass(roster: readonly HeroClass[]): Record<HeroClass, number> {
  const count = Object.fromEntries(HERO_CLASSES.map(heroClass => [heroClass, 0])) as Record<HeroClass, number>
  for (const heroClass of roster) count[heroClass]++
  return count
}
