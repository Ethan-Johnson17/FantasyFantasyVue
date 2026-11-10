import { createRng } from '../../lib/random.js'
import { HERO_CLASSES, type HeroClass } from '../heroes/classes.js'
import type { CoopRules } from '../scoring/rulesets.js'
import { ENCOUNTERS } from './encounters.js'

/*
 * Co-op's campaign rules (docs/COOP_SPEC.md, "The campaign"). Pure, so the season engine and the balancing simulation
 * (scripts/simulate-coop.ts) play exactly the same rules.
 */

/** The boss raid's monster: an eleventh, stronger monster, with a fifth encounter's weaknesses and resistance */
export const BOSS_NAME = 'The Dragon Tyrant'

export interface CoopMonster {
  name: string
  weak: readonly HeroClass[]
  resists: HeroClass
  boss: boolean
  /** Whole hit points */
  hp: number
  /** The last game week it may fall by */
  deadline: number
}

/**
 * The league's monsters, set at the draft: four of Crossover's ten encounters in an order shuffled from the seed, then
 * the boss with the next encounter's weaknesses. HP follows docs/COOP_SPEC.md, "HP and difficulty".
 */
export function coopMonsters(seed: string, season: number, partyCount: number, rules: CoopRules): CoopMonster[] {
  const perParty = rules.partyDamage[partyCount]
  if (perParty === undefined) throw new Error(`No Co-op party damage for ${String(partyCount)} parties`)
  const order = createRng(seed, 'campaign').shuffle(ENCOUNTERS)
  if (order.length < rules.deadlines.length) throw new Error('Not enough encounters for the campaign')
  const variation = createRng(seed, 'campaign-hp')
  const seasonFactor = rules.seasonFactors[season] ?? 1
  const last = rules.deadlines.length - 1

  return rules.deadlines.map((deadline, index) => {
    const encounter = order[index] ?? ENCOUNTERS[0]
    if (!encounter) throw new Error('No encounters defined')
    const boss = index === last
    const weeks = deadline - (index === 0 ? 0 : (rules.deadlines[index - 1] ?? 0))
    const factor = boss ? rules.bossFactor : rules.chapterFactor
    const varied = 1 + (variation.next() * 2 - 1) * rules.hpVariation
    return {
      name: boss ? BOSS_NAME : encounter.name,
      weak: [...encounter.weak],
      resists: encounter.resists,
      boss,
      hp: Math.max(1, Math.round(partyCount * perParty * seasonFactor * weeks * factor * varied)),
      deadline
    }
  })
}

interface StoredMonster {
  name: string
  weak: readonly string[]
  resists: string
  boss: boolean
  hp: number
  deadline: number
}

const isHeroClass = (value: string): value is HeroClass => (HERO_CLASSES as readonly string[]).includes(value)

/** A league's stored monsters (league.campaign.monsters) as plain, checked values; empty without a campaign. */
export function readMonsters(campaign: { monsters: readonly StoredMonster[] } | null | undefined): CoopMonster[] {
  return (campaign?.monsters ?? []).map(monster => {
    const weak = monster.weak.filter(isHeroClass)
    if (weak.length !== monster.weak.length || !isHeroClass(monster.resists)) throw new Error(`Monster ${monster.name} has an unknown class`)
    return { name: monster.name, weak, resists: monster.resists, boss: monster.boss, hp: monster.hp, deadline: monster.deadline }
  })
}

/** A monster's damage multiplier for a class: weak, resisted, or neither. */
export function monsterMultiplier(monster: Pick<CoopMonster, 'weak' | 'resists'>, heroClass: HeroClass, rules: CoopRules): number {
  if (monster.weak.includes(heroClass)) return rules.weakMultiplier
  if (monster.resists === heroClass) return rules.resistMultiplier
  return 1
}

export type CampaignOutcome = 'ongoing' | 'won' | 'lost'

export interface CampaignState {
  /** The current chapter, 1-based (the last one fought, once the campaign is over) */
  chapter: number
  /** The current monster's HP left, to the hundredth */
  hpLeft: number
  livesLeft: number
  outcome: CampaignOutcome
}

export interface CampaignWeek {
  /** The chapter fought this week */
  chapter: number
  hpBefore: number
  /** Every party's damage this week, added together */
  dealt: number
  /** Chapters whose monster fell this week; overkill can bring down the next one too */
  fallen: number[]
  /** The chapter whose deadline passed with its monster standing, if any (it cost a life) */
  failed: number | null
  /** That monster's HP left when its deadline passed */
  failedHpLeft: number | null
  /** The campaign after this week */
  state: CampaignState
}

const hundredths = (value: number) => Math.round(value * 100)

export function startCampaign(monsters: readonly CoopMonster[], rules: CoopRules): CampaignState {
  const first = monsters[0]
  if (!first) throw new Error('A campaign needs monsters')
  return { chapter: 1, hpLeft: first.hp, livesLeft: rules.lives, outcome: 'ongoing' }
}

/**
 * One game week of the campaign. The league's damage goes to the current monster; if it falls, overkill carries into
 * the next chapter, which starts at once (its deadline stays put, so a strong start banks time). If the deadline
 * passes with the monster standing, the league loses a life and moves on to the next chapter. The campaign is won
 * when the boss falls, and lost when the last life goes or the boss outlasts its deadline.
 */
export function playCampaignWeek(state: CampaignState, dealt: number, week: number, monsters: readonly CoopMonster[]): CampaignWeek {
  if (state.outcome !== 'ongoing') throw new Error('The campaign is over')
  const fought = state.chapter
  const hpBefore = state.hpLeft
  let chapter = state.chapter
  let left = hundredths(state.hpLeft)
  let damage = Math.max(0, hundredths(dealt))
  let livesLeft = state.livesLeft
  const fallen: number[] = []
  const finish = (outcome: CampaignOutcome, failed: { chapter: number; hpLeft: number } | null = null): CampaignWeek => ({
    chapter: fought,
    hpBefore,
    dealt: Math.max(0, hundredths(dealt)) / 100,
    fallen,
    failed: failed?.chapter ?? null,
    failedHpLeft: failed ? failed.hpLeft / 100 : null,
    state: { chapter, hpLeft: left / 100, livesLeft, outcome }
  })

  while (damage >= left) {
    damage -= left
    fallen.push(chapter)
    const next = monsters[chapter] // 1-based chapter, so this is the next monster
    if (!next) {
      left = 0
      return finish('won')
    }
    chapter++
    left = hundredths(next.hp)
  }
  left -= damage

  const current = monsters[chapter - 1]
  if (current && week >= current.deadline) {
    livesLeft--
    const failed = { chapter, hpLeft: left }
    const next = monsters[chapter]
    if (!next || livesLeft <= 0) return finish('lost', failed)
    chapter++
    left = hundredths(next.hp)
    return finish('ongoing', failed)
  }
  return finish('ongoing')
}
