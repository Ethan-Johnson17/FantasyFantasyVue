import { describe, expect, it } from 'vitest'
import { createRng } from '../src/lib/random.js'
import { decideBattle, decideMonsterBattle, monsterDamage, scoreParty } from '../src/modules/season/battle.js'
import { roundRobin, SEASON_WEEKS } from '../src/modules/season/schedule.js'

const parties = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i)}`)

describe('roundRobin', () => {
  it.each([2, 3, 4, 5, 6])('gives each of %i parties exactly one game every week', n => {
    const schedule = roundRobin(parties(n), createRng('s'))
    expect(schedule).toHaveLength(SEASON_WEEKS)
    for (const { week, matchups } of schedule) {
      const seen = matchups.flatMap(m => (m.away ? [m.home, m.away] : [m.home]))
      expect(seen.sort(), `week ${String(week)}`).toEqual(parties(n).sort())
      expect(matchups.filter(m => m.away === null)).toHaveLength(n % 2) // one monster game when odd
    }
  })

  it.each([3, 4, 5, 6])('pairs every two of %i parties exactly once per cycle', n => {
    const cycle = n % 2 === 0 ? n - 1 : n
    const pairs = roundRobin(parties(n), createRng('s'))
      .slice(0, cycle)
      .flatMap(week => week.matchups.filter(m => m.away).map(m => [m.home, m.away].sort().join('-')))
    expect(new Set(pairs).size).toBe(pairs.length)
    expect(pairs).toHaveLength((n * (n - 1)) / 2)
  })

  it('is reproducible from the seed and rejects tiny leagues', () => {
    expect(roundRobin(parties(5), createRng('x'))).toEqual(roundRobin(parties(5), createRng('x')))
    expect(() => roundRobin(parties(1), createRng('x'))).toThrow()
  })
})

describe('battle math', () => {
  const side = (total: number, top: number, bench: number) => ({ total, top, bench })

  it('sums starters and bench exactly', () => {
    expect(scoreParty([0.1, 0.2], [0.3])).toEqual({ total: 0.3, top: 0.2, bench: 0.3 })
  })

  it('decides by total, then top hero, then bench, then draw', () => {
    expect(decideBattle(side(80, 20, 5), side(79.99, 30, 50))).toBe('home')
    expect(decideBattle(side(80, 20, 5), side(80, 25, 0))).toBe('away')
    expect(decideBattle(side(80, 25, 5), side(80, 25, 6))).toBe('away')
    expect(decideBattle(side(80, 25, 5), side(80, 25, 5))).toBe('draw')
  })

  it('treats floating-point-equal totals as equal', () => {
    expect(decideBattle(side(0.1 + 0.2, 1, 1), side(0.3, 1, 1))).toBe('draw')
  })

  it('pits a party against the league-average monster', () => {
    const damage = monsterDamage([90, 60, 75])
    expect(damage).toBe(75)
    expect(decideMonsterBattle(side(90, 0, 0), damage)).toBe('home')
    expect(decideMonsterBattle(side(60, 0, 0), damage)).toBe('away')
    expect(decideMonsterBattle(side(75, 0, 0), damage)).toBe('draw')
    expect(monsterDamage([10, 10, 10.01])).toBe(10)
  })
})
