import { createRng } from '../../lib/random.js'
import type { HeroClass } from '../heroes/classes.js'
import type { SoloRules } from '../scoring/rulesets.js'
import { BOSS_NAME, type CoopMonster } from '../season/campaign.js'
import { ENCOUNTERS } from '../season/encounters.js'

/*
 * Solo's pure rules (docs/SOLO_SPEC.md): prices, the best party under the cap, and the campaign scaled to the weeks
 * left. Pure, so the server and the balancing simulation (scripts/simulate-solo.ts) play exactly the same rules.
 */

/** A hero's price in gold at a Level (1-10). */
export function soloCost(level: number, costs: readonly number[]): number {
  const cost = costs[Math.min(costs.length, Math.max(1, Math.round(level))) - 1]
  if (cost === undefined) throw new Error('Solo has no cost table')
  return cost
}

export interface BuyableHero {
  id: string
  heroClass: HeroClass
  cost: number
  /** Projected class damage per game */
  value: number
}

export interface PartySlots {
  fighters: number
  bench: number
  /** Most Paladins (team defenses) the party may hold */
  paladins: number
}

export interface BestParty<T extends BuyableHero> {
  /** The fighters, highest value first */
  fighters: T[]
  bench: T[]
  /** The fighters' projected damage per game, added up */
  projected: number
}

/**
 * The party worth the most under the cap: an exact search over fighters (worth their value) and bench spots (worth
 * benchWeight of it), at most `paladins` team defenses. Ties keep the earlier hero in a stable order, so the same pool
 * always gives the same party. `maxCost` leaves out heroes priced above it.
 */
export function bestParty<T extends BuyableHero>(
  pool: Iterable<T>,
  cap: number,
  slots: PartySlots,
  benchWeight: number,
  maxCost = Infinity
): BestParty<T> {
  // Within one class and price only the best few can matter.
  const groups = new Map<string, T[]>()
  for (const hero of pool) {
    if (hero.cost > maxCost || hero.cost > cap) continue
    const key = `${hero.heroClass}:${String(hero.cost)}`
    groups.set(key, [...(groups.get(key) ?? []), hero])
  }
  const keep = slots.fighters + slots.bench
  const items = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, group]) => group.sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)).slice(0, keep))

  // dp[f][b][p][c]: the best worth with f fighters, b bench, p Paladins, costing exactly c
  const F = slots.fighters + 1
  const B = slots.bench + 1
  const P = slots.paladins + 1
  const C = cap + 1
  const index = (f: number, b: number, p: number, c: number) => ((f * B + b) * P + p) * C + c
  const size = F * B * P * C
  let dp = new Float64Array(size).fill(-Infinity)
  dp[index(0, 0, 0, 0)] = 0
  // choices[item][state]: 0 skipped, 1 a fighter, 2 on the bench
  const choices: Uint8Array[] = []
  for (const item of items) {
    const next = Float64Array.from(dp)
    const choice = new Uint8Array(size)
    const paladin = item.heroClass === 'Paladin' ? 1 : 0
    for (let f = 0; f < F; f++)
      for (let b = 0; b < B; b++)
        for (let p = 0; p + paladin < P; p++)
          for (let c = 0; c + item.cost < C; c++) {
            const from = dp[index(f, b, p, c)] ?? -Infinity
            if (from === -Infinity) continue
            const offer = (to: number, worth: number, kind: number) => {
              if (worth > (next[to] ?? -Infinity)) {
                next[to] = worth
                choice[to] = kind
              }
            }
            if (f + 1 < F) offer(index(f + 1, b, p + paladin, c + item.cost), from + item.value, 1)
            if (b + 1 < B) offer(index(f, b + 1, p + paladin, c + item.cost), from + item.value * benchWeight, 2)
          }
    choices.push(choice)
    dp = next
  }
  let best = -Infinity
  let state = { f: slots.fighters, b: slots.bench, p: 0, c: 0 }
  for (let p = 0; p < P; p++)
    for (let c = 0; c < C; c++) {
      const worth = dp[index(slots.fighters, slots.bench, p, c)] ?? -Infinity
      if (worth > best) {
        best = worth
        state = { f: slots.fighters, b: slots.bench, p, c }
      }
    }
  if (best === -Infinity) throw new Error(`No party fits a cap of ${String(cap)}`)
  const fighters: T[] = []
  const bench: T[] = []
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    const choice = choices[i]?.[index(state.f, state.b, state.p, state.c)] ?? 0
    if (!item || choice === 0) continue
    ;(choice === 1 ? fighters : bench).push(item)
    const paladin = item.heroClass === 'Paladin' ? 1 : 0
    state = { f: state.f - (choice === 1 ? 1 : 0), b: state.b - (choice === 2 ? 1 : 0), p: state.p - paladin, c: state.c - item.cost }
  }
  const byValue = (a: T, b: T) => b.value - a.value || a.id.localeCompare(b.id)
  fighters.sort(byValue)
  bench.sort(byValue)
  return { fighters, bench, projected: fighters.reduce((sum, hero) => sum + hero.value, 0) }
}

/**
 * Each monster's window in weeks, for a run of `weeks`: the boss gets round(weeks / 7) (at least 1), and the rest are
 * shared among the chapters before it, any spare weeks going to the later ones.
 */
export function soloWindows(weeks: number, chapters: number): number[] {
  if (chapters < 2) throw new Error('A campaign needs chapters before the boss')
  const boss = Math.max(1, Math.round(weeks / 7))
  const rest = weeks - boss
  const base = Math.floor(rest / (chapters - 1))
  const spare = rest - base * (chapters - 1)
  return [...Array.from({ length: chapters - 1 }, (_, index) => base + (index >= chapters - 1 - spare ? 1 : 0)), boss]
}

/** The run's monsters in order, without HP: the encounters drawn from the seed, as shown before the run starts. */
export function soloEncounters(seed: string, chapters: number): Pick<CoopMonster, 'name' | 'weak' | 'resists' | 'boss'>[] {
  const order = createRng(seed, 'campaign').shuffle(ENCOUNTERS)
  if (order.length < chapters) throw new Error('Not enough encounters for the campaign')
  return order.slice(0, chapters).map((encounter, index) => {
    const boss = index === chapters - 1
    return { name: boss ? BOSS_NAME : encounter.name, weak: [...encounter.weak], resists: encounter.resists, boss }
  })
}

/**
 * The run's monsters, set when the party is confirmed (docs/SOLO_SPEC.md, "HP"): HP is the best buyable party's
 * projected damage per week x projectionScale x the window's weeks x the chapter or boss factor, varied by up to
 * hpVariation from the seed. Deadlines count game weeks from the run's first.
 */
export function soloMonsters(seed: string, weeks: number, projected: number, rules: SoloRules): CoopMonster[] {
  const windows = soloWindows(weeks, rules.chapters)
  const encounters = soloEncounters(seed, rules.chapters)
  const variation = createRng(seed, 'campaign-hp')
  let deadline = 0
  return encounters.map((encounter, index) => {
    const window = windows[index] ?? 1
    deadline += window
    const varied = 1 + (variation.next() * 2 - 1) * rules.hpVariation
    const factor = encounter.boss ? rules.bossFactor : rules.chapterFactor
    return { ...encounter, hp: Math.max(1, Math.round(projected * rules.projectionScale * window * factor * varied)), deadline }
  })
}
