import { describe, expect, it } from 'vitest'
import { weeklyProfile } from '../src/modules/draft/candidates.js'
import { assignTraits, selectHeroPool, type HeroTrait, type PoolCandidate } from '../src/modules/heroes/pool.js'
import { RULESET_V1, type StrategyRules } from '../src/modules/scoring/rulesets.js'
import { applyStrategy, type Fighter } from '../src/modules/season/strategy.js'

// Round numbers so expected values are easy to read; the real values live in RULESET_V1.
const RULES: StrategyRules = { championMultiplier: 1.25, mightyChampionMultiplier: 1.5, orderAndChaosBonus: 0.1, bulwarkFloor: 15 }

const fighter = (heroId: string, damage: number, traits: HeroTrait[] = [], isChampion = false): Fighter => ({
  heroId,
  traits,
  damage,
  isChampion
})

describe('applyStrategy', () => {
  it('changes nothing without a Champion or synergy', () => {
    const outcome = applyStrategy([fighter('a', 10), fighter('b', 7.5, ['mighty'])], RULES)
    expect(Object.fromEntries(outcome.damage)).toEqual({ a: 10, b: 7.5 })
    expect(outcome.total).toBe(17.5)
    expect(outcome.synergies).toEqual([])
  })

  it('multiplies the Champion, and a Mighty Champion by more', () => {
    const plain = applyStrategy([fighter('a', 10, [], true), fighter('b', 5)], RULES)
    expect(plain.damage.get('a')).toBe(12.5)
    expect(plain.total).toBe(17.5)
    expect(plain.synergies).toEqual([])

    const mighty = applyStrategy([fighter('a', 10, ['mighty'], true), fighter('b', 5)], RULES)
    expect(mighty.damage.get('a')).toBe(15)
    expect(mighty.synergies).toEqual(['mightyChampion'])
  })

  it('Bulwark: a Wild Champion with a Steadfast ally deals at least the floor', () => {
    const low = applyStrategy([fighter('w', 2, ['wild'], true), fighter('s', 8, ['steadfast'])], RULES)
    expect(low.damage.get('w')).toBe(15)
    expect(low.synergies).toContain('bulwark')
    // A big week keeps its full Champion boost.
    const high = applyStrategy([fighter('w', 20, ['wild'], true), fighter('s', 8, ['steadfast'])], RULES)
    expect(high.damage.get('w')).toBe(25)
    // No Steadfast ally fighting: no floor.
    const alone = applyStrategy([fighter('w', 2, ['wild'], true), fighter('x', 8)], RULES)
    expect(alone.damage.get('w')).toBe(2.5)
    expect(alone.synergies).not.toContain('bulwark')
    // A Wild hero who isn't the Champion gets no floor.
    const notChampion = applyStrategy([fighter('w', 2, ['wild']), fighter('s', 8, ['steadfast'], true)], RULES)
    expect(notChampion.damage.get('w')).toBe(2)
    expect(notChampion.synergies).not.toContain('bulwark')
  })

  it('Order & Chaos: Steadfast and Wild fighting together boost the party total', () => {
    const both = applyStrategy([fighter('s', 10, ['steadfast']), fighter('w', 10, ['wild'])], RULES)
    expect(both.total).toBe(22)
    expect(both.synergies).toEqual(['orderAndChaos'])
    // Per-hero damage is unchanged; the bonus applies to the total.
    expect(Object.fromEntries(both.damage)).toEqual({ s: 10, w: 10 })

    expect(applyStrategy([fighter('s', 10, ['steadfast']), fighter('t', 10, ['steadfast'])], RULES).synergies).toEqual([])
  })

  it('stacks every synergy in one party', () => {
    const outcome = applyStrategy(
      [fighter('champ', 4, ['wild', 'mighty'], true), fighter('s', 10, ['steadfast'])],
      RULES
    )
    // Mighty: 4 x 1.5 = 6, raised to the Bulwark floor of 15; Order & Chaos then adds 10% to 25.
    expect(outcome.damage.get('champ')).toBe(15)
    expect(outcome.total).toBe(27.5)
    expect(new Set(outcome.synergies)).toEqual(new Set(['mightyChampion', 'bulwark', 'orderAndChaos']))
  })

  it('handles a party with nobody fighting', () => {
    expect(applyStrategy([], RULES)).toEqual({ damage: new Map(), total: 0, synergies: [] })
  })

  it('uses sensible values in the current ruleset', () => {
    const { championMultiplier, mightyChampionMultiplier, orderAndChaosBonus, bulwarkFloor } = RULESET_V1.strategy
    expect(championMultiplier).toBeGreaterThan(1)
    expect(mightyChampionMultiplier).toBeGreaterThan(championMultiplier)
    expect(orderAndChaosBonus).toBeGreaterThan(0)
    expect(bulwarkFloor).toBeGreaterThan(0)
  })
})

describe('weeklyProfile', () => {
  it('measures average, swing relative to average, and best week', () => {
    expect(weeklyProfile([10, 10, 10, 10])).toEqual({ ppg: 10, volatility: 0, ceiling: 10 })
    const swingy = weeklyProfile([0, 20, 0, 20])
    expect(swingy.ppg).toBe(10)
    expect(swingy.volatility).toBeCloseTo(1, 6)
    expect(swingy.ceiling).toBe(20)
  })

  it("doesn't blow up when the average is near zero", () => {
    expect(Number.isFinite(weeklyProfile([-1, 1, -1, 1]).volatility)).toBe(true)
  })
})

describe('assignTraits', () => {
  const vet = (id: string, volatility: number, ceiling: number): PoolCandidate => ({
    sourceKind: 'player',
    sourceId: id,
    heroClass: 'Mage',
    ppg: 10,
    volatility,
    ceiling
  })

  it('gives the steadiest third Steadfast, the swingiest third Wild, the top third by ceiling Mighty', () => {
    const traits = assignTraits([
      vet('a', 0.1, 30),
      vet('b', 0.2, 25),
      vet('c', 0.5, 20),
      vet('d', 0.6, 15),
      vet('e', 0.9, 10),
      vet('f', 1.0, 5)
    ])
    expect(Object.fromEntries(traits)).toEqual({
      a: ['steadfast', 'mighty'],
      b: ['steadfast', 'mighty'],
      c: [],
      d: [],
      e: ['wild'],
      f: ['wild']
    })
  })

  it('never makes a hero both Steadfast and Wild, and breaks ties by id', () => {
    const tied = ['e', 'd', 'c', 'b', 'a'].map(id => vet(id, 0.5, 10))
    const traits = assignTraits(tied)
    expect(traits.get('a')).toEqual(['steadfast', 'mighty'])
    expect(traits.get('e')).toEqual(['wild'])
    for (const list of traits.values()) expect(list.includes('steadfast') && list.includes('wild')).toBe(false)
  })

  it('gives no traits when a class has too few veterans for thirds', () => {
    expect([...assignTraits([vet('a', 0.1, 30), vet('b', 1, 5)]).values()]).toEqual([[], []])
  })

  it('is applied by selectHeroPool to veterans only', () => {
    const candidates: PoolCandidate[] = ['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin'].flatMap(heroClass => [
      ...Array.from({ length: 12 }, (_, i): PoolCandidate => ({
        sourceKind: 'player',
        sourceId: `${heroClass}-vet-${String(i).padStart(2, '0')}`,
        heroClass: heroClass as PoolCandidate['heroClass'],
        ppg: 20 - i,
        volatility: i / 12,
        ceiling: 40 - i
      })),
      { sourceKind: 'player', sourceId: `${heroClass}-rookie`, heroClass: heroClass as PoolCandidate['heroClass'], ppg: null, draft: { round: 1, pick: 1 } }
    ])
    const pool = selectHeroPool(candidates, 2, RULESET_V1.pool)
    expect(pool.filter(entry => entry.level === null).every(entry => entry.traits.length === 0)).toBe(true)
    expect(pool.some(entry => entry.traits.includes('steadfast'))).toBe(true)
    expect(pool.some(entry => entry.traits.includes('wild'))).toBe(true)
    expect(pool.some(entry => entry.traits.includes('mighty'))).toBe(true)
  })
})
