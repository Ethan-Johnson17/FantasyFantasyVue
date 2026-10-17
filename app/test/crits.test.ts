import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { apiKey } from '../src/api/inject'
import type { HeroDetail, ResultHero, ResultSide, WeekResult } from '../src/api/types'
import { critLabel } from '../src/heroes'
import { provideLeagueForTest } from '../src/league'
import { battleRecap } from '../src/recap'
import BattleResultView from '../src/views/league/BattleResultView.vue'
import HeroDetailView from '../src/views/league/HeroDetailView.vue'
import { detail, fakeApi } from './helpers'

const crest = { emblem: 'crown', banner: 'crimson' } as const
const hero = (heroId: string, name: string, heroClass: ResultHero['heroClass'], damage: number, crit: ResultHero['crit'] = null): ResultHero => ({
  heroId,
  name,
  heroClass,
  slot: 'slot1',
  damage,
  resting: false,
  swappedInto: null,
  crit
})
const side = (partyId: string, name: string, total: number, heroes: ResultHero[], extra: Partial<ResultSide> = {}): ResultSide => ({
  partyId,
  name,
  crest,
  total,
  champion: null,
  synergies: [],
  heroes,
  ...extra
})

describe('critLabel', () => {
  it('names each class’s crits', () => {
    expect(critLabel('success', 'Warrior')).toBe('Natural 20 · Cleave')
    expect(critLabel('fail', 'Mage')).toBe('Natural 1 · Spell Fizzles')
    expect(critLabel('success', 'Unknown')).toBe('Natural 20')
  })
})

describe('battleRecap', () => {
  const us = side('a', 'The Goblin 5', 112.4, [hero('h1', 'Beldon', 'Warrior', 48, 'success'), hero('h2', 'Gideon', 'Mage', 2, 'fail'), hero('h3', 'Ivy', 'Ranger', 20)], {
    champion: 'h1',
    synergies: ['orderAndChaos']
  })
  const them = side('b', 'Bot Party 3', 98, [hero('t1', 'Wolf', 'Paladin', 47, 'success'), hero('t2', 'Fang', 'Rogue', 30)])

  it('tells the battle from my side: result, top hero, crits on both sides, synergies', () => {
    const lines = battleRecap({ week: 3, us, them, opponentName: them.name, opponentTotal: them.total })
    expect(lines[0]).toMatch(/^The Goblin 5 (defeated|overcame) Bot Party 3, 112 to 98\.$/)
    expect(lines[1]).toMatch(/^Beldon, the party's Champion, (led the charge|carried the day|struck hardest) with 48 damage\.$/)
    expect(lines).toContain("Beldon's Cleave landed for 48: a natural 20!")
    expect(lines).toContain("For Bot Party 3, Wolf's Divine Smite landed for 47: a natural 20!")
    expect(lines).toContain('Gideon rolled a natural 1. Spell Fizzles, just 2 damage.')
    expect(lines.at(-1)).toMatch(/Order & Chaos/)
  })

  it('is the same every time for the same battle', () => {
    const input = { week: 3, us, them, opponentName: them.name, opponentTotal: them.total }
    expect(battleRecap(input)).toEqual(battleRecap(input))
  })

  it('handles defeats, draws, near things, and the monster', () => {
    const lost = battleRecap({ week: 1, us: side('a', 'Elves', 50, []), them: null, opponentName: 'Grimjaw', opponentTotal: 90 })
    expect(lost[0]).toMatch(/^Grimjaw (routed|overwhelmed) Elves, 90 to 50\.$/)
    const close = battleRecap({ week: 1, us: side('a', 'Elves', 100, []), them: null, opponentName: 'Grimjaw', opponentTotal: 99 })
    expect(close[0]).toMatch(/^Elves (edged|narrowly held off) Grimjaw, 100 to 99\.$/)
    const draw = battleRecap({ week: 1, us: side('a', 'Elves', 80, []), them: null, opponentName: 'Grimjaw', opponentTotal: 80 })
    expect(draw[0]).toBe('Elves and Grimjaw fought to a standstill, 80 apiece.')
  })

  it('keeps crit lines short, natural 20s first', () => {
    const many = side('a', 'Elves', 200, ['a', 'b', 'c', 'd', 'e'].map((id, i) => hero(id, `Hero ${id}`, 'Mage', 40 - i, i % 2 ? 'fail' : 'success')))
    const lines = battleRecap({ week: 2, us: many, them: null, opponentName: 'Grimjaw', opponentTotal: 100 })
    const crits = lines.filter(line => line.includes('natural'))
    expect(crits).toHaveLength(3)
    expect(crits.slice(0, 3).every(line => line.includes('natural 20'))).toBe(true)
  })
})

async function mountAt(view: Component, path: string, api: ReturnType<typeof fakeApi>) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/battles/:week', component: view },
      { path: '/heroes/:heroId', component: view },
      { path: '/:rest(.*)*', component: { template: '<div />' } }
    ]
  })
  await router.push(path)
  await router.isReady()
  const league = detail({ status: 'active', parties: [{ id: 'a', name: 'The Goblin 5', crest, owner: { id: 'o', displayName: 'Ethan' }, isMine: true }] })
  const wrapper = mount(view, {
    global: { plugins: [router], provide: { [apiKey as symbol]: api, ...provideLeagueForTest(league, vi.fn()) } }
  })
  await flushPromises()
  return wrapper
}

describe('crits on screen', () => {
  it('badges natural 20s and 1s on battle results, with a recap', async () => {
    const result: WeekResult = {
      week: 3,
      matchups: [
        {
          home: side('a', 'The Goblin 5', 112, [hero('h1', 'Beldon', 'Warrior', 48, 'success'), hero('h2', 'Gideon', 'Mage', 2, 'fail')]),
          away: side('b', 'Bot Party 3', 98, [hero('t1', 'Wolf', 'Paladin', 47, 'success')]),
          monster: null,
          outcome: 'home'
        }
      ]
    }
    const wrapper = await mountAt(BattleResultView, '/battles/3', fakeApi({ getWeekResult: vi.fn().mockResolvedValue(result) }))
    const fighters = wrapper.findAll('.fighter')
    expect(fighters[0]!.text()).toContain('Natural 20 · Cleave')
    expect(fighters[0]!.find('[aria-label="Natural 20"]').exists()).toBe(true)
    expect(fighters[1]!.text()).toContain('Natural 1 · Spell Fizzles')
    expect(wrapper.find('.opponent-hero.success').exists()).toBe(true)
    expect(wrapper.find('.recap').text()).toContain("Beldon's Cleave landed for 48: a natural 20!")
  })

  it('marks crit weeks on a hero’s season chart', async () => {
    const heroDetail: HeroDetail = {
      hero: {
        id: 'h1', name: 'Beldon', heroClass: 'Warrior', race: 'Dwarf', gender: 'male', weapon: 'Axe', skill: 'Cleave',
        attack: 12, defense: 10, magic: 3, level: 9, levelRange: null, traits: [], partyId: 'a'
      },
      history: [
        { week: 1, slot: 'slot1', damage: 48, resting: false, swappedInto: null, crit: 'success' },
        { week: 2, slot: 'slot1', damage: 2, resting: false, swappedInto: null, crit: 'fail' },
        { week: 3, slot: 'slot1', damage: 18, resting: false, swappedInto: null, crit: null }
      ]
    }
    const wrapper = await mountAt(HeroDetailView, '/heroes/h1', fakeApi({ getHero: vi.fn().mockResolvedValue(heroDetail) }))
    expect(wrapper.findAll('.bar.success')).toHaveLength(1)
    expect(wrapper.findAll('.bar.fail')).toHaveLength(1)
    expect(wrapper.find('.crit-summary').text()).toBe('1 × natural 20 (Cleave) · 1 × natural 1 (Stumble)')
    expect(wrapper.find('.chart').attributes('aria-label')).toContain('week 1, 48, natural 20')
  })
})
