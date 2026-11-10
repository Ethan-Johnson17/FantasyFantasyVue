import { describe, expect, it } from 'vitest'
import { COOP_V1, type CoopRules } from '../src/modules/scoring/rulesets.js'
import {
  BOSS_NAME,
  coopMonsters,
  monsterMultiplier,
  playCampaignWeek,
  readMonsters,
  startCampaign,
  type CampaignState,
  type CoopMonster
} from '../src/modules/season/campaign.js'
import { ENCOUNTERS } from '../src/modules/season/encounters.js'

const RULES = COOP_V1.coop as CoopRules

/** Five small monsters with the spec's deadlines, for exact campaign arithmetic */
const MONSTERS: CoopMonster[] = [100, 200, 300, 400, 500].map((hp, index) => ({
  name: `Monster ${String(index + 1)}`,
  weak: ['Mage', 'Warrior'],
  resists: 'Paladin',
  boss: index === 4,
  hp,
  deadline: RULES.deadlines[index] ?? 14
}))

const state = (chapter: number, hpLeft: number, livesLeft = 3): CampaignState => ({ chapter, hpLeft, livesLeft, outcome: 'ongoing' })

describe('coopMonsters', () => {
  it('sets four encounters and the boss, with the spec deadlines', () => {
    const monsters = coopMonsters('seed-a', 2020, 6, RULES)
    expect(monsters.map(monster => monster.deadline)).toEqual([3, 6, 9, 12, 14])
    expect(monsters.map(monster => monster.boss)).toEqual([false, false, false, false, true])
    expect(monsters[4]?.name).toBe(BOSS_NAME)
    const names = monsters.slice(0, 4).map(monster => monster.name)
    expect(new Set(names).size).toBe(4)
    for (const name of names) expect(ENCOUNTERS.map(encounter => encounter.name)).toContain(name)
    for (const monster of monsters) {
      expect(monster.weak).toHaveLength(2)
      expect(monster.weak).not.toContain(monster.resists)
    }
  })

  it('follows the HP formula: parties x damage by size x season x weeks x factor, within the seeded variation', () => {
    const parties = 6
    const season = 2018
    const monsters = coopMonsters('seed-b', season, parties, RULES)
    const weeks = [3, 3, 3, 3, 2]
    monsters.forEach((monster, index) => {
      const factor = monster.boss ? RULES.bossFactor : RULES.chapterFactor
      const base = parties * (RULES.partyDamage[parties] ?? 0) * (RULES.seasonFactors[season] ?? 0) * (weeks[index] ?? 0) * factor
      expect(Number.isInteger(monster.hp)).toBe(true)
      expect(monster.hp).toBeGreaterThanOrEqual(Math.floor(base * (1 - RULES.hpVariation)))
      expect(monster.hp).toBeLessThanOrEqual(Math.ceil(base * (1 + RULES.hpVariation)))
    })
  })

  it('scales with league size and season, and is the same for the same seed', () => {
    const plain = { ...RULES, hpVariation: 0 }
    const hp = (seed: string, season: number, parties: number) => coopMonsters(seed, season, parties, plain).map(monster => monster.hp)
    expect(hp('s', 2020, 4)).toEqual(hp('s', 2020, 4))
    expect(hp('s', 2020, 4)[0]).toBe(Math.round(4 * 105 * 0.98 * 3))
    expect(hp('s', 2018, 4)[0]).toBe(Math.round(4 * 105 * 1.11 * 3))
    expect(hp('s', 2020, 12)[4]).toBe(Math.round(12 * 93 * 0.98 * 2 * 1.25))
    // A season without a factor counts as average.
    expect(hp('s', 2031, 4)[0]).toBe(4 * 105 * 3)
  })

  it('varies HP from the seed, so a monster’s HP alone does not give away the season', () => {
    const first = (seed: string) => coopMonsters(seed, 2020, 6, RULES)[0]?.hp
    const values = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(first))
    expect(values.size).toBeGreaterThan(1)
  })

  it('refuses a league size it has no damage for', () => {
    expect(() => coopMonsters('s', 2020, 13, RULES)).toThrow(/13 parties/)
  })
})

describe('monsterMultiplier', () => {
  it('is x1.25 for a weakness, x0.75 for the resisted class, x1 otherwise', () => {
    const monster = MONSTERS[0] as CoopMonster
    expect(monsterMultiplier(monster, 'Mage', RULES)).toBe(1.25)
    expect(monsterMultiplier(monster, 'Paladin', RULES)).toBe(0.75)
    expect(monsterMultiplier(monster, 'Rogue', RULES)).toBe(1)
  })
})

describe('readMonsters', () => {
  it('rejects a stored class that does not exist', () => {
    const stored = { monsters: [{ ...(MONSTERS[0] as CoopMonster), weak: ['Mage', 'Bard'] }] }
    expect(() => readMonsters(stored)).toThrow(/unknown class/)
    expect(readMonsters(null)).toEqual([])
  })
})

describe('playCampaignWeek', () => {
  it('starts on chapter 1 with full HP and every life', () => {
    expect(startCampaign(MONSTERS, RULES)).toEqual({ chapter: 1, hpLeft: 100, livesLeft: 3, outcome: 'ongoing' })
  })

  it('takes the week’s damage off the current monster', () => {
    const week = playCampaignWeek(state(1, 100), 40.25, 1, MONSTERS)
    expect(week).toMatchObject({ chapter: 1, hpBefore: 100, dealt: 40.25, fallen: [], failed: null })
    expect(week.state).toEqual(state(1, 59.75))
  })

  it('brings a monster down at exactly 0 HP, and starts the next chapter at once (banking time)', () => {
    const week = playCampaignWeek(state(1, 100), 100, 1, MONSTERS)
    expect(week.fallen).toEqual([1])
    expect(week.state).toEqual(state(2, 200))
  })

  it('carries overkill into the next monster', () => {
    const week = playCampaignWeek(state(1, 30), 80, 2, MONSTERS)
    expect(week.fallen).toEqual([1])
    expect(week.state).toEqual(state(2, 150))
  })

  it('lets a big enough week bring down two monsters', () => {
    const week = playCampaignWeek(state(1, 50), 260, 2, MONSTERS)
    expect(week.fallen).toEqual([1, 2])
    expect(week.state).toEqual(state(3, 290))
  })

  it('keeps the next chapter’s deadline when it starts early', () => {
    // Chapter 2 started in week 2; its deadline is still week 6, so week 5 passes without losing a life.
    expect(playCampaignWeek(state(2, 200), 10, 5, MONSTERS).state).toEqual(state(2, 190))
    expect(playCampaignWeek(state(2, 200), 10, 6, MONSTERS).failed).toBe(2)
  })

  it('costs a life when the deadline passes with the monster standing, and moves on', () => {
    const week = playCampaignWeek(state(1, 100), 30, 3, MONSTERS)
    expect(week.failed).toBe(1)
    expect(week.failedHpLeft).toBe(70)
    expect(week.state).toEqual(state(2, 200, 2))
  })

  it('counts a fall in the deadline week as a kill, not a failure', () => {
    const week = playCampaignWeek(state(1, 100), 100, 3, MONSTERS)
    expect(week.failed).toBeNull()
    expect(week.state).toEqual(state(2, 200, 3))
  })

  it('ends in defeat when the last life is lost', () => {
    const week = playCampaignWeek(state(3, 300, 1), 0, 9, MONSTERS)
    expect(week.failed).toBe(3)
    expect(week.state).toEqual({ chapter: 3, hpLeft: 300, livesLeft: 0, outcome: 'lost' })
  })

  it('ends in defeat when the boss outlasts its deadline, lives or not', () => {
    const week = playCampaignWeek(state(5, 500), 499.99, 14, MONSTERS)
    expect(week.state.outcome).toBe('lost')
    expect(week.failed).toBe(5)
  })

  it('ends in victory when the boss falls', () => {
    const week = playCampaignWeek(state(5, 500, 1), 650, 13, MONSTERS)
    expect(week.fallen).toEqual([5])
    expect(week.state).toEqual({ chapter: 5, hpLeft: 0, livesLeft: 1, outcome: 'won' })
  })

  it('never heals a monster', () => {
    expect(playCampaignWeek(state(1, 100), -20, 1, MONSTERS).state.hpLeft).toBe(100)
  })

  it('refuses to play on once the campaign is over', () => {
    expect(() => playCampaignWeek({ chapter: 5, hpLeft: 0, livesLeft: 1, outcome: 'won' }, 10, 14, MONSTERS)).toThrow(/over/)
  })
})
