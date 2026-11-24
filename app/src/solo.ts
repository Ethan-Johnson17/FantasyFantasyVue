import type { HeroClass, SoloHero, SoloRun } from './api/types'

/* Solo runs as players build them (docs/SOLO_SPEC.md): the pool's filters, the budget, and what a pick or swap allows. */

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DEF'] as const
export type Position = (typeof POSITIONS)[number]

export type SoloSort = 'value' | 'level' | 'cost' | 'projected' | 'name'
export const SORTS: { value: SoloSort; label: string }[] = [
  { value: 'value', label: 'Best for the price' },
  { value: 'level', label: 'Level' },
  { value: 'projected', label: 'Projected' },
  { value: 'cost', label: 'Cheapest' },
  { value: 'name', label: 'Name' }
]

export interface PoolFilter {
  position: Position | null
  heroClass: HeroClass | null
  /** Matches the hero's or the player's name, or the team */
  query: string
}

export const goldText = (gold: number): string => `${gold.toLocaleString()} gold`

export function filterPool(pool: readonly SoloHero[], filter: PoolFilter): SoloHero[] {
  const query = filter.query.trim().toLowerCase()
  return pool.filter(hero => {
    if (filter.position && hero.player?.position !== filter.position) return false
    if (filter.heroClass && hero.heroClass !== filter.heroClass) return false
    if (!query) return true
    return [hero.name, hero.player?.name ?? '', hero.player?.team ?? ''].some(text => text.toLowerCase().includes(query))
  })
}

/**
 * How far each hero's projection is above (or below) the average of heroes at the same Level, and so the same price,
 * among these heroes. Prices follow Level, but projections vary a lot within one: this finds the heroes worth more
 * than they cost.
 */
export function overLevel(pool: readonly SoloHero[]): Map<string, number> {
  const totals = new Map<number, { sum: number; count: number }>()
  for (const hero of pool) {
    const entry = totals.get(hero.level ?? 0) ?? { sum: 0, count: 0 }
    totals.set(hero.level ?? 0, { sum: entry.sum + hero.projected, count: entry.count + 1 })
  }
  return new Map(
    pool.map(hero => {
      const entry = totals.get(hero.level ?? 0)
      return [hero.id, entry ? hero.projected - entry.sum / entry.count : 0]
    })
  )
}

/** A Quest party's projected damage a week: its fighters' projections added up (before the Champion and synergies) */
export const questProjection = (fighters: readonly SoloHero[]): number => fighters.reduce((sum, hero) => sum + hero.projected, 0)

export function sortPool(pool: readonly SoloHero[], sort: SoloSort): SoloHero[] {
  const byName = (a: SoloHero, b: SoloHero) => (a.player?.name ?? a.name).localeCompare(b.player?.name ?? b.name)
  const over = sort === 'value' ? overLevel(pool) : new Map<string, number>()
  const compare: Record<SoloSort, (a: SoloHero, b: SoloHero) => number> = {
    value: (a, b) => (over.get(b.id) ?? 0) - (over.get(a.id) ?? 0) || b.projected - a.projected || byName(a, b),
    level: (a, b) => (b.level ?? 0) - (a.level ?? 0) || b.projected - a.projected || byName(a, b),
    projected: (a, b) => b.projected - a.projected || byName(a, b),
    cost: (a, b) => a.cost - b.cost || b.projected - a.projected || byName(a, b),
    name: byName
  }
  return [...pool].sort(compare[sort])
}

/** Why a hero can't join the party being built, or null when they can */
export function pickProblem(run: Pick<SoloRun, 'rosterSize' | 'cap' | 'paladinLimit'>, picks: readonly SoloHero[], hero: SoloHero): string | null {
  if (picks.some(pick => pick.id === hero.id)) return null
  if (picks.length >= run.rosterSize) return `Your party has its ${String(run.rosterSize)} heroes`
  const spent = picks.reduce((sum, pick) => sum + pick.cost, 0)
  if (spent + hero.cost > run.cap) return `Costs ${goldText(hero.cost)}: ${goldText(run.cap - spent)} left`
  if (hero.heroClass === 'Paladin' && picks.filter(pick => pick.heroClass === 'Paladin').length >= run.paladinLimit) {
    return `At most ${String(run.paladinLimit)} Paladins`
  }
  return null
}

/** Gold left to spend once these heroes are released and these signed: swaps made together pool their gold */
export function swapGold(run: Pick<SoloRun, 'cap' | 'spent'>, releases: readonly SoloHero[], signings: readonly SoloHero[]): number {
  const freed = releases.reduce((sum, hero) => sum + (hero.price ?? 0), 0)
  const cost = signings.reduce((sum, hero) => sum + hero.cost, 0)
  return run.cap - run.spent + freed - cost
}

/**
 * Why the party can't sign `sign` along with the swaps chosen so far, or null when it can (the API checks again).
 * The releases and signings are made together, so the gold from every release counts toward every signing.
 */
export function swapProblem(run: SoloRun, releases: readonly SoloHero[], signings: readonly SoloHero[], sign: SoloHero): string | null {
  if (run.swapsLeft === null || run.swapsLeft <= 0) return 'No swaps left this week'
  const lockedRelease = releases.find(hero => hero.locked)
  if (lockedRelease) return `${lockedRelease.name} has kicked off`
  if (sign.locked) return `${sign.name} has kicked off`
  if (signings.length >= releases.length) return 'Release another hero to sign one more'
  const toSpend = swapGold(run, releases, signings)
  if (sign.cost > toSpend) return `Costs ${goldText(sign.cost)}: ${goldText(toSpend)} to spend`
  if (sign.heroClass === 'Paladin') {
    const count = (heroes: readonly SoloHero[]) => heroes.filter(hero => hero.heroClass === 'Paladin').length
    const paladins = count(run.pool.filter(hero => hero.partyId !== null)) - count(releases) + count(signings)
    if (paladins >= run.paladinLimit) return `At most ${String(run.paladinLimit)} Paladins`
  }
  return null
}

/** Each monster's window in a run's weeks, as a sentence */
export function windowsText(windows: readonly number[]): string {
  return windows.map(weeks => `${String(weeks)} ${weeks === 1 ? 'week' : 'weeks'}`).join(', ')
}
