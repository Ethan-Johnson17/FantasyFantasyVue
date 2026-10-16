import type { HeroTrait } from '../heroes/pool.js'
import type { StrategyRules } from '../scoring/rulesets.js'

/*
 * The strategy layer: weekly Champion and trait synergies. Pure, so the season engine and the
 * balancing simulation run exactly the same math. Rules: docs/CLASSIC_SCORING.md, "Strategy layer".
 */

export const SYNERGIES = ['orderAndChaos', 'mightyChampion', 'bulwark'] as const
export type Synergy = (typeof SYNERGIES)[number]

export interface Fighter {
  heroId: string
  traits: readonly HeroTrait[]
  /** Damage before the strategy layer (class multiplier and any auto-swap penalty applied) */
  damage: number
  isChampion: boolean
}

export interface StrategyOutcome {
  /** Each fighter's damage after Champion effects */
  damage: Map<string, number>
  /** Party total after synergies */
  total: number
  /** Synergies that took effect this week */
  synergies: Synergy[]
}

const round2 = (value: number) => Math.round(value * 100) / 100

export function applyStrategy(fighters: readonly Fighter[], rules: StrategyRules): StrategyOutcome {
  const has = (trait: HeroTrait, except?: string) =>
    fighters.some(fighter => fighter.heroId !== except && fighter.traits.includes(trait))
  const synergies: Synergy[] = []
  const damage = new Map(fighters.map(fighter => [fighter.heroId, fighter.damage]))

  const champion = fighters.find(fighter => fighter.isChampion)
  if (champion) {
    const mighty = champion.traits.includes('mighty')
    if (mighty) synergies.push('mightyChampion')
    let boosted = champion.damage * (mighty ? rules.mightyChampionMultiplier : rules.championMultiplier)
    if (champion.traits.includes('wild') && has('steadfast', champion.heroId)) {
      synergies.push('bulwark')
      boosted = Math.max(boosted, rules.bulwarkFloor)
    }
    damage.set(champion.heroId, round2(boosted))
  }

  let total = [...damage.values()].reduce((sum, value) => sum + value, 0)
  if (has('steadfast') && has('wild')) {
    synergies.push('orderAndChaos')
    total *= 1 + rules.orderAndChaosBonus
  }
  return { damage, total: round2(total), synergies }
}
