import { describe, expect, it } from 'vitest'
import { createRng } from '../src/lib/random.js'
import { HERO_CLASSES, type HeroClass } from '../src/modules/heroes/classes.js'
import { SOLO_V1 } from '../src/modules/scoring/rulesets.js'
import { BOSS_NAME } from '../src/modules/season/campaign.js'
import { ENCOUNTERS } from '../src/modules/season/encounters.js'
import { bestParty, soloCost, soloEncounters, soloMonsters, soloWindows, type BuyableHero } from '../src/modules/solo/soloRules.js'

const rules = SOLO_V1.solo!

describe('Solo prices', () => {
  it('are the Level squared, 1 to 100 gold', () => {
    expect(Array.from({ length: 10 }, (_, i) => soloCost(i + 1, rules.costs))).toEqual([1, 4, 9, 16, 25, 36, 49, 64, 81, 100])
  })

  it('stay within the table for out-of-range Levels', () => {
    expect(soloCost(0, rules.costs)).toBe(1)
    expect(soloCost(11, rules.costs)).toBe(100)
  })
})

describe('Solo windows', () => {
  it('scale the campaign to the weeks left, as in the spec', () => {
    // The shortest run, a run from NFL week 2, and Co-op's 14 weeks
    expect(soloWindows(8, 5)).toEqual([1, 2, 2, 2, 1])
    expect(soloWindows(16, 5)).toEqual([3, 3, 4, 4, 2])
    expect(soloWindows(14, 5)).toEqual([3, 3, 3, 3, 2])
    // 11 / 7 rounds up: two weeks for the boss
    expect(soloWindows(11, 5)).toEqual([2, 2, 2, 3, 2])
  })

  it('always add up to the run and give every monster a week', () => {
    for (let weeks = 8; weeks <= 16; weeks++) {
      const windows = soloWindows(weeks, 5)
      expect(windows.reduce((sum, w) => sum + w, 0)).toBe(weeks)
      expect(Math.min(...windows)).toBeGreaterThanOrEqual(1)
      // Spare weeks go to the later chapters
      const chapters = windows.slice(0, -1)
      expect([...chapters].sort((a, b) => a - b)).toEqual(chapters)
    }
  })
})

/** Every way of choosing `fighters` + `bench` heroes, by brute force: the best worth. */
function bruteForce(pool: readonly BuyableHero[], cap: number, fighters: number, bench: number, paladins: number, benchWeight: number) {
  let best = -Infinity
  const pick = (start: number, f: number, b: number, cost: number, worth: number, p: number) => {
    if (cost > cap || p > paladins) return
    if (f === fighters && b === bench) {
      best = Math.max(best, worth)
      return
    }
    for (let i = start; i < pool.length; i++) {
      const hero = pool[i]!
      const paladin = hero.heroClass === 'Paladin' ? 1 : 0
      if (f < fighters) pick(i + 1, f + 1, b, cost + hero.cost, worth + hero.value, p + paladin)
      if (b < bench) pick(i + 1, f, b + 1, cost + hero.cost, worth + hero.value * benchWeight, p + paladin)
    }
  }
  pick(0, 0, 0, 0, 0, 0)
  return best
}

function randomPool(seed: string, size: number): BuyableHero[] {
  const rng = createRng(seed)
  return Array.from({ length: size }, (_, i) => {
    const level = rng.int(1, 10)
    return {
      id: `h${String(i).padStart(2, '0')}`,
      heroClass: rng.pick<HeroClass>(HERO_CLASSES),
      cost: soloCost(level, rules.costs),
      value: Math.round((5 + level * 2 + rng.next() * 6) * 100) / 100
    }
  })
}

describe('the best party under the cap', () => {
  it('finds the most valuable party, as a brute-force search does', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const pool = randomPool(seed, 12)
      const found = bestParty(pool, 150, { fighters: 3, bench: 2, paladins: 1 }, 0.35)
      const worth = found.fighters.reduce((sum, hero) => sum + hero.value, 0) + found.bench.reduce((sum, hero) => sum + hero.value * 0.35, 0)
      expect(worth).toBeCloseTo(bruteForce(pool, 150, 3, 2, 1, 0.35), 6)
    }
  })

  it('stays under the cap and the Paladin limit, with the fighters as the projection', () => {
    const pool = randomPool('solo', 120)
    const found = bestParty(pool, rules.cap, { fighters: 5, bench: 3, paladins: 2 }, rules.benchWeight)
    const party = [...found.fighters, ...found.bench]
    expect(found.fighters).toHaveLength(5)
    expect(found.bench).toHaveLength(3)
    expect(new Set(party.map(hero => hero.id)).size).toBe(8)
    expect(party.reduce((sum, hero) => sum + hero.cost, 0)).toBeLessThanOrEqual(rules.cap)
    expect(party.filter(hero => hero.heroClass === 'Paladin').length).toBeLessThanOrEqual(2)
    expect(found.projected).toBeCloseTo(found.fighters.reduce((sum, hero) => sum + hero.value, 0), 6)
    // The fighters are worth at least as much as the bench
    expect(Math.min(...found.fighters.map(hero => hero.value))).toBeGreaterThanOrEqual(Math.max(...found.bench.map(hero => hero.value)))
  })

  it('prefers a fighter to a bench spot: a strong hero fights', () => {
    const pool: BuyableHero[] = [
      { id: 'star', heroClass: 'Mage', cost: 4, value: 30 },
      { id: 'a', heroClass: 'Warrior', cost: 1, value: 10 },
      { id: 'b', heroClass: 'Ranger', cost: 1, value: 9 }
    ]
    const found = bestParty(pool, 6, { fighters: 2, bench: 1, paladins: 2 }, 0.35)
    expect(found.fighters.map(hero => hero.id)).toEqual(['star', 'a'])
    expect(found.bench.map(hero => hero.id)).toEqual(['b'])
  })

  it('leaves out heroes priced above maxCost, and refuses when nothing fits', () => {
    const pool: BuyableHero[] = [
      { id: 'star', heroClass: 'Mage', cost: 100, value: 40 },
      { id: 'a', heroClass: 'Warrior', cost: 1, value: 10 },
      { id: 'b', heroClass: 'Ranger', cost: 1, value: 9 }
    ]
    expect(bestParty(pool, 116, { fighters: 1, bench: 1, paladins: 2 }, 0.35).fighters[0]?.id).toBe('star')
    expect(bestParty(pool, 116, { fighters: 1, bench: 1, paladins: 2 }, 0.35, 50).fighters[0]?.id).toBe('a')
    expect(() => bestParty(pool, 1, { fighters: 1, bench: 1, paladins: 2 }, 0.35)).toThrow(/No party fits/)
  })

  it('is the same party for the same pool, whatever order it comes in', () => {
    const pool = randomPool('order', 60)
    const one = bestParty(pool, rules.cap, { fighters: 5, bench: 3, paladins: 2 }, rules.benchWeight)
    const two = bestParty([...pool].reverse(), rules.cap, { fighters: 5, bench: 3, paladins: 2 }, rules.benchWeight)
    expect(two.fighters.map(hero => hero.id)).toEqual(one.fighters.map(hero => hero.id))
    expect(two.bench.map(hero => hero.id)).toEqual(one.bench.map(hero => hero.id))
  })
})

describe('Solo monsters', () => {
  it('are four encounters from the seed and then the boss', () => {
    const shown = soloEncounters('run-seed', 5)
    expect(shown).toHaveLength(5)
    expect(shown.map(monster => monster.boss)).toEqual([false, false, false, false, true])
    expect(shown[4]?.name).toBe(BOSS_NAME)
    for (const monster of shown.slice(0, 4)) expect(ENCOUNTERS.map(encounter => encounter.name)).toContain(monster.name)
    expect(new Set(shown.map(monster => monster.name)).size).toBe(5)
    expect(soloEncounters('run-seed', 5)).toEqual(shown)
  })

  it('set deadlines from the windows and HP from the projection, the window and the seed', () => {
    const projected = 80
    const monsters = soloMonsters('run-seed', 10, projected, rules)
    // 10 weeks: windows 2, 2, 2, 3, 1
    expect(monsters.map(monster => monster.deadline)).toEqual([2, 4, 6, 9, 10])
    const windows = [2, 2, 2, 3, 1]
    monsters.forEach((monster, index) => {
      const expected = projected * rules.projectionScale * windows[index]! * (monster.boss ? rules.bossFactor : rules.chapterFactor)
      expect(monster.hp).toBeGreaterThanOrEqual(Math.floor(expected * (1 - rules.hpVariation)))
      expect(monster.hp).toBeLessThanOrEqual(Math.ceil(expected * (1 + rules.hpVariation)))
    })
    // The encounters shown before the run are the ones fought
    expect(monsters.map(({ name, weak, resists, boss }) => ({ name, weak, resists, boss }))).toEqual(soloEncounters('run-seed', 5))
    expect(soloMonsters('run-seed', 10, projected, rules)).toEqual(monsters)
    expect(soloMonsters('other-seed', 10, projected, rules)).not.toEqual(monsters)
  })

  it('grow with the projection: a stronger week to start means stronger monsters', () => {
    const weak = soloMonsters('run-seed', 10, 60, rules)
    const strong = soloMonsters('run-seed', 10, 90, rules)
    weak.forEach((monster, index) => {
      expect(strong[index]!.hp).toBeGreaterThan(monster.hp)
    })
  })
})
