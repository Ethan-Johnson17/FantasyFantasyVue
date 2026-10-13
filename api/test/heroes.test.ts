import { describe, expect, it } from 'vitest'
import { createRng, newSeed } from '../src/lib/random.js'
import { runSnakeDraft, slotsStillNeeded, type DraftHero } from '../src/modules/draft/snakeDraft.js'
import { CLASS_TRAITS, HERO_CLASSES, type HeroClass } from '../src/modules/heroes/classes.js'
import { generateAppearances } from '../src/modules/heroes/generator.js'
import { autoLineup, maxFillableSlots, planAutoSwaps, validateLineup } from '../src/modules/heroes/lineup.js'
import { expectedLevel, mysteryRange, selectHeroPool, type PoolCandidate } from '../src/modules/heroes/pool.js'
import { RULESET_V1, type LineupRules } from '../src/modules/scoring/rulesets.js'

const POOL = RULESET_V1.pool
const LINEUP = RULESET_V1.lineup
const SLOTS = LINEUP.slots
const ROSTER_SIZE = LINEUP.rosterSize

describe('createRng', () => {
  it('is deterministic per seed and label, and independent across labels', () => {
    const sample = (seed: string, label: string) => {
      const rng = createRng(seed, label)
      return Array.from({ length: 5 }, () => rng.next())
    }
    expect(sample('abc', 'pool')).toEqual(sample('abc', 'pool'))
    expect(sample('abc', 'pool')).not.toEqual(sample('abc', 'draft'))
    expect(sample('abc', 'pool')).not.toEqual(sample('abd', 'pool'))
  })

  it('stays in range and covers it', () => {
    const rng = createRng(newSeed())
    const seen = new Set(Array.from({ length: 2000 }, () => rng.int(1, 6)))
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('shuffles without losing items', () => {
    const items = Array.from({ length: 50 }, (_, i) => i)
    expect(createRng('s').shuffle(items).sort((a, b) => a - b)).toEqual(items)
  })
})

/** Candidates: plenty of veterans per class, with recruits for every class except Paladin. */
function candidates(perClass = 40): PoolCandidate[] {
  return HERO_CLASSES.flatMap(heroClass => [
    ...Array.from({ length: perClass }, (_, i) => ({
      sourceKind: heroClass === 'Paladin' ? ('defense' as const) : ('player' as const),
      sourceId: `${heroClass}-vet-${String(i).padStart(2, '0')}`,
      heroClass,
      ppg: 30 - i * 0.5
    })),
    ...(heroClass === 'Paladin'
      ? []
      : Array.from({ length: 6 }, (_, i) => ({
          sourceKind: 'player' as const,
          sourceId: `${heroClass}-rookie-${String(i)}`,
          heroClass,
          ppg: null,
          draft: { round: i + 1, pick: 10 + i * 32 }
        })))
  ])
}

describe('selectHeroPool', () => {
  it('sizes each class to about twice what the parties need', () => {
    const pool = selectHeroPool(candidates(), 4, POOL)
    for (const heroClass of HERO_CLASSES) {
      expect(pool.filter(entry => entry.heroClass === heroClass)).toHaveLength(POOL.perParty[heroClass] * 4)
    }
    expect(pool).toHaveLength(23 * 4)
  })

  it('takes the best veterans, and up to 20% mystery recruits by draft order', () => {
    const warriors = selectHeroPool(candidates(), 2, POOL).filter(entry => entry.heroClass === 'Warrior')
    // 12 Warriors: 2 recruits (20%, rounded down), 10 veterans
    const recruits = warriors.filter(entry => entry.level === null)
    expect(recruits.map(entry => entry.sourceId)).toEqual(['Warrior-rookie-0', 'Warrior-rookie-1'])
    expect(recruits.map(entry => entry.levelRange)).toEqual([mysteryRange(1), mysteryRange(2)])
    const veterans = warriors.filter(entry => entry.level !== null)
    expect(veterans.map(entry => entry.sourceId)).toEqual(Array.from({ length: 10 }, (_, i) => `Warrior-vet-0${String(i)}`))
  })

  it('assigns Level deciles among the class veterans, best first', () => {
    const mages = selectHeroPool(candidates(), 4, POOL).filter(entry => entry.heroClass === 'Mage' && entry.level !== null)
    const levels = mages.map(entry => entry.level)
    expect(levels[0]).toBe(10)
    expect(levels).toEqual([...levels].sort((a, b) => (b ?? 0) - (a ?? 0)))
    expect(Math.min(...levels.map(level => level ?? 0))).toBeGreaterThanOrEqual(1)
  })

  it('fills with extra recruits when veterans run short, and fails clearly when both do', () => {
    // 6 veterans per class; 2 parties need 8 Rogues, so 2 recruits fill the gap (the 20% cap alone would allow 1).
    const rogues = selectHeroPool(candidates(6), 2, POOL).filter(entry => entry.heroClass === 'Rogue')
    expect(rogues).toHaveLength(8)
    expect(rogues.filter(entry => entry.level === null)).toHaveLength(2)
    expect(() => selectHeroPool(candidates(1), 6, POOL)).toThrow(/Not enough Mage candidates/)
  })

  it('maps draft rounds to the documented ranges', () => {
    expect([1, 2, 3, 4, 7].map(mysteryRange)).toEqual([
      { min: 6, max: 10 },
      { min: 4, max: 9 },
      { min: 3, max: 8 },
      { min: 1, max: 6 },
      { min: 1, max: 6 }
    ])
    expect(expectedLevel({ level: null, levelRange: { min: 4, max: 9 } })).toBe(6.5)
  })
})

describe('generateAppearances', () => {
  const pool = selectHeroPool(candidates(), 6, POOL)
  const heroes = generateAppearances(pool, createRng('seed', 'pool'))

  it('gives every hero a unique name and class-appropriate traits', () => {
    expect(new Set(heroes.map(hero => hero.name)).size).toBe(heroes.length)
    for (const hero of heroes) {
      const traits = CLASS_TRAITS[hero.heroClass]
      expect(traits.races).toContain(hero.race)
      expect(hero.weapon).toBe(traits.weapon)
      expect(hero.attack - traits.base.attack).toBeGreaterThanOrEqual(1)
      expect(hero.attack - traits.base.attack).toBeLessThanOrEqual(3)
    }
  })

  it('follows the original male/female weighting per class', () => {
    // Pool-sized batches (names are unique per pool), 4,000 heroes in total.
    const mage = pool.find(entry => entry.heroClass === 'Mage')!
    const paladin = pool.find(entry => entry.heroClass === 'Paladin')!
    const batch = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? mage : paladin))
    const many = Array.from({ length: 40 }, (_, i) => generateAppearances(batch, createRng('weights', String(i)))).flat()
    const maleShare = (heroClass: HeroClass) => {
      const ofClass = many.filter(hero => hero.heroClass === heroClass)
      return ofClass.filter(hero => hero.gender === 'male').length / ofClass.length
    }
    expect(maleShare('Mage')).toBeCloseTo(2 / 3, 1)
    expect(maleShare('Paladin')).toBeCloseTo(3 / 4, 1)
  })

  it('is reproducible from the seed', () => {
    expect(generateAppearances(pool, createRng('seed', 'pool'))).toEqual(heroes)
  })
})

describe('slotsStillNeeded', () => {
  it('counts missing required classes plus FLEX', () => {
    expect(slotsStillNeeded([], SLOTS)).toBe(6)
    expect(slotsStillNeeded(['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin'], SLOTS)).toBe(1)
    expect(slotsStillNeeded(['Mage', 'Warrior', 'Warrior', 'Ranger', 'Rogue', 'Paladin'], SLOTS)).toBe(0)
    // A second Mage can't fill FLEX
    expect(slotsStillNeeded(['Mage', 'Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin'], SLOTS)).toBe(1)
  })
})

function draftPool(partyCount: number): DraftHero[] {
  const pool = selectHeroPool(candidates(), partyCount, POOL)
  return pool.map((entry, i) => ({ id: `h${String(i)}`, heroClass: entry.heroClass, value: expectedLevel(entry) }))
}

describe('runSnakeDraft', () => {
  it('snakes the order and gives everyone a full roster', () => {
    const heroes = draftPool(3)
    const parties = ['a', 'b', 'c'].map(id => ({ id, ranking: [] }))
    const { order, picks } = runSnakeDraft(parties, heroes, createRng('draft'), LINEUP)

    expect(picks).toHaveLength(3 * ROSTER_SIZE)
    expect(picks.slice(0, 6).map(pick => pick.partyId)).toEqual([...order, ...[...order].reverse()])
    expect(new Set(picks.map(pick => pick.heroId)).size).toBe(picks.length)
  })

  it("follows each party's ranking when the pick is allowed", () => {
    const heroes = draftPool(2)
    const paladins = heroes.filter(hero => hero.heroClass === 'Paladin').map(hero => hero.id)
    const mages = heroes.filter(hero => hero.heroClass === 'Mage').map(hero => hero.id)
    const parties = [
      { id: 'a', ranking: [mages[2]!, paladins[3]!] },
      { id: 'b', ranking: [] }
    ]
    const { picks } = runSnakeDraft(parties, heroes, createRng('draft'), LINEUP)
    const picksOf = (party: string) => picks.filter(pick => pick.partyId === party).map(pick => pick.heroId)
    expect(picksOf('a').slice(0, 2)).toEqual([mages[2], paladins[3]])
  })

  it('never lets parties hoard a scarce class that others still need', () => {
    // 3 parties share 6 Paladins. Without the fairness rule, a and b could take 3 each and starve c.
    const heroes = draftPool(3)
    const paladins = heroes.filter(hero => hero.heroClass === 'Paladin').map(hero => hero.id)
    const { picks } = runSnakeDraft(
      [
        { id: 'a', ranking: paladins },
        { id: 'b', ranking: [...paladins].reverse() },
        { id: 'c', ranking: [] }
      ],
      heroes,
      createRng('draft'),
      LINEUP
    )
    for (const party of ['a', 'b', 'c']) {
      const count = picks.filter(pick => pick.partyId === party && paladins.includes(pick.heroId)).length
      expect(count, party).toBeGreaterThanOrEqual(1)
    }
  })

  it('always produces rosters that can field a full lineup (randomized)', () => {
    for (let trial = 0; trial < 300; trial++) {
      const rng = createRng(`trial-${String(trial)}`)
      const partyCount = rng.int(2, 6)
      const heroes = draftPool(partyCount)
      // Rankings: random subsets, often greedy for one class to stress the fairness rules.
      const parties = Array.from({ length: partyCount }, (_, p) => {
        // Greedy: every hero of a favorite class first, then a random sample of the rest.
        const favorite = rng.pick(HERO_CLASSES)
        const shuffled = rng.shuffle(heroes)
        const ranked = [
          ...shuffled.filter(hero => hero.heroClass === favorite),
          ...shuffled.filter(hero => hero.heroClass !== favorite && rng.chance(0.3))
        ]
        return { id: `p${String(p)}`, ranking: ranked.map(hero => hero.id) }
      })
      const { picks } = runSnakeDraft(parties, heroes, rng, LINEUP)
      const heroById = new Map(heroes.map(hero => [hero.id, hero]))
      for (const party of parties) {
        const roster = picks.filter(pick => pick.partyId === party.id).map(pick => heroById.get(pick.heroId)!)
        expect(roster).toHaveLength(ROSTER_SIZE)
        expect(() => autoLineup(roster, SLOTS)).not.toThrow()
      }
    }
  })
})

describe('autoLineup', () => {
  it('starts the highest-Level hero per slot and the best remaining FLEX-eligible hero', () => {
    const roster = [
      { id: 'm1', heroClass: 'Mage' as const, value: 5 },
      { id: 'm2', heroClass: 'Mage' as const, value: 9 },
      { id: 'w1', heroClass: 'Warrior' as const, value: 7 },
      { id: 'w2', heroClass: 'Warrior' as const, value: 8 },
      { id: 'r1', heroClass: 'Ranger' as const, value: 6 },
      { id: 't1', heroClass: 'Rogue' as const, value: 4 },
      { id: 'p1', heroClass: 'Paladin' as const, value: 3 },
      { id: 'r2', heroClass: 'Ranger' as const, value: 2 }
    ]
    expect(autoLineup(roster, SLOTS)).toEqual({ Mage: 'm2', Warrior: 'w2', Ranger: 'r1', Rogue: 't1', Paladin: 'p1', Flex: 'w1' })
  })
})

describe('planAutoSwaps', () => {
  const lineup = { Mage: 'm1', Warrior: 'w1', Ranger: 'r1', Rogue: 't1', Paladin: 'p1', Flex: 'w2' }
  const bench = (id: string, heroClass: HeroClass, value: number, resting = false) => ({ id, heroClass, value, resting })

  it('swaps a resting starter for the best fitting bench hero by Level', () => {
    const swaps = planAutoSwaps(lineup, SLOTS, new Set(['m1']), [bench('m2', 'Mage', 3), bench('m3', 'Mage', 7), bench('w3', 'Warrior', 9)])
    expect([...swaps]).toEqual([['Mage', 'm3']])
  })

  it('fills FLEX from any FLEX-eligible class, and fills required slots first', () => {
    // Only one bench Warrior: the Warrior slot gets it, FLEX takes the Ranger.
    const swaps = planAutoSwaps(lineup, SLOTS, new Set(['w1', 'w2']), [bench('w3', 'Warrior', 9), bench('r2', 'Ranger', 2)])
    expect([...swaps]).toEqual([
      ['Warrior', 'w3'],
      ['Flex', 'r2']
    ])
  })

  it('never swaps in resting or ineligible bench heroes, or the same hero twice', () => {
    expect(planAutoSwaps(lineup, SLOTS, new Set(['m1']), [bench('m2', 'Mage', 9, true)]).size).toBe(0)
    expect(planAutoSwaps(lineup, SLOTS, new Set(['p1']), [bench('w3', 'Warrior', 9)]).size).toBe(0)
    expect(planAutoSwaps(lineup, SLOTS, new Set(['r1', 'w2']), [bench('r2', 'Ranger', 5)]).size).toBe(1)
  })
})

/** Alternative lineup shapes: the engine must handle any configuration, not just v1's. */
const ALL: readonly HeroClass[] = ['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin']
const ADVENTURER: readonly HeroClass[] = ['Warrior', 'Ranger', 'Rogue']
const CONFIGS: Record<string, Pick<LineupRules, 'rosterSize' | 'slots'>> = {
  v1: LINEUP,
  'five open slots': {
    rosterSize: 10,
    slots: Array.from({ length: 5 }, (_, i) => ({ key: `slot${String(i + 1)}`, label: 'Hero', classes: ALL }))
  },
  'Mage + Paladin + 3 Adventurers': {
    rosterSize: 10,
    slots: [
      { key: 'Mage', label: 'Mage', classes: ['Mage'] },
      { key: 'Paladin', label: 'Paladin', classes: ['Paladin'] },
      ...Array.from({ length: 3 }, (_, i) => ({ key: `adv${String(i + 1)}`, label: 'Adventurer', classes: ADVENTURER }))
    ]
  }
}

describe('maxFillableSlots', () => {
  it('finds the best assignment, not just a greedy one', () => {
    const slots = CONFIGS['Mage + Paladin + 3 Adventurers']!.slots
    expect(maxFillableSlots(['Mage', 'Warrior', 'Warrior', 'Rogue', 'Paladin'], slots)).toBe(5)
    expect(maxFillableSlots(['Mage', 'Mage', 'Warrior'], slots)).toBe(2)
    // A specialist slot and an open slot both accept Mage; matching must use both heroes.
    const mixed = [
      { key: 'a', label: 'A', classes: ['Mage'] as HeroClass[] },
      { key: 'b', label: 'B', classes: ALL }
    ]
    expect(maxFillableSlots(['Mage', 'Mage'], mixed)).toBe(2)
    expect(maxFillableSlots(['Paladin', 'Paladin'], mixed)).toBe(1)
  })
})

describe('validateLineup', () => {
  const slots = CONFIGS['five open slots']!.slots
  const classOf = (id: string) => ({ a: 'Mage', b: 'Mage', c: 'Rogue', d: 'Paladin', e: 'Warrior', f: 'Ranger' } as Record<string, HeroClass>)[id]
  const full = { slot1: 'a', slot2: 'b', slot3: 'c', slot4: 'd', slot5: 'e' }

  it('accepts any classes in open slots', () => {
    expect(validateLineup(full, slots, classOf)).toBeNull()
  })

  it('rejects missing or extra slots, repeats, and unknown heroes', () => {
    const { slot5: _dropped, ...missingOne } = full
    expect(validateLineup(missingOne, slots, classOf)).toMatch(/exactly/)
    expect(validateLineup({ ...full, slot6: 'f' }, slots, classOf)).toMatch(/exactly/)
    expect(validateLineup({ ...full, slot5: 'a' }, slots, classOf)).toMatch(/only fill one/)
    expect(validateLineup({ ...full, slot5: 'zzz' }, slots, classOf)).toMatch(/must be a hero/)
  })

  it('rejects ineligible classes in restricted slots', () => {
    expect(validateLineup({ Mage: 'c' }, [{ key: 'Mage', label: 'Mage', classes: ['Mage'] }], classOf)).toMatch(/cannot fill/)
  })
})

describe.each(Object.entries(CONFIGS))('draft and lineups with %s', (_name, rules) => {
  it('always produces rosters that can field a full lineup (randomized, greedy rankings)', () => {
    for (let trial = 0; trial < 150; trial++) {
      const rng = createRng(`config-trial-${String(trial)}`)
      const partyCount = rng.int(2, 6)
      const heroes = draftPool(partyCount)
      const parties = Array.from({ length: partyCount }, (_, p) => {
        const favorite = rng.pick(HERO_CLASSES)
        const shuffled = rng.shuffle(heroes)
        const ranked = [
          ...shuffled.filter(hero => hero.heroClass === favorite),
          ...shuffled.filter(hero => hero.heroClass !== favorite && rng.chance(0.3))
        ]
        return { id: `p${String(p)}`, ranking: ranked.map(hero => hero.id) }
      })
      const { picks } = runSnakeDraft(parties, heroes, rng, rules)
      const heroById = new Map(heroes.map(hero => [hero.id, hero]))
      for (const party of parties) {
        const roster = picks.filter(pick => pick.partyId === party.id).map(pick => heroById.get(pick.heroId)!)
        expect(roster).toHaveLength(rules.rosterSize)
        const lineup = autoLineup(roster, rules.slots)
        expect(validateLineup(lineup, rules.slots, id => heroById.get(id)?.heroClass)).toBeNull()
      }
    }
  })
})
