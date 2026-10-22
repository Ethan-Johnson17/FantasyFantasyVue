import type { Crit, Hero, HeroClass, HeroTrait, StrategyRules, Synergy } from './api/types'

export const HERO_CLASSES: HeroClass[] = ['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin']

/** Class colors (see tokens.css). */
export const CLASS_COLOR: Record<HeroClass, string> = {
  Mage: 'var(--class-mage)',
  Warrior: 'var(--class-warrior)',
  Ranger: 'var(--class-ranger)',
  Rogue: 'var(--class-rogue)',
  Paladin: 'var(--class-paladin)'
}

/** Class icons on a 24x24 grid (from the redesign canvas). */
export const CLASS_ICON: Record<HeroClass, string> = {
  Mage: 'M6 21L15 9 M15 3l1.2 2.8 2.8 1.2-2.8 1.2L15 11l-1.2-2.8L11 7l2.8-1.2z',
  Warrior: 'M19 4L8.5 14.5 M5.5 11.5l7 7 M4 20l3.5-3.5 M15 4h4v4',
  Ranger: 'M6 3c8 3 8 15 0 18 M6 3v18 M4 12h15 M16 9l3 3-3 3',
  Rogue: 'M12 2l2 10h-4z M7.5 13h9 M12 13v8',
  Paladin: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'
}

/**
 * How much a class's damage swings week to week (measured on 2012–2025 data):
 * Mages are steady, Rogues and Paladins boom or bust.
 */
export const CLASS_TEMPERAMENT: Record<HeroClass, { label: string; description: string }> = {
  Mage: { label: 'Steady', description: 'Mages deal reliable damage week after week.' },
  Warrior: { label: 'Balanced', description: 'Warriors mix solid weeks with the occasional big one.' },
  Ranger: { label: 'Balanced', description: 'Rangers mix solid weeks with the occasional big one.' },
  Rogue: { label: 'Swingy', description: 'Rogues strike from the shadows: big weeks and quiet ones.' },
  Paladin: { label: 'Swingy', description: 'Paladins hold the line, with big weeks and quiet ones.' }
}

/** "Lv 9", or "Lv 1–4" for mystery recruits. */
export function levelText(hero: Pick<Hero, 'level' | 'levelRange'>): string {
  if (hero.level !== null) return `Lv ${String(hero.level)}`
  if (hero.levelRange) {
    const { min, max } = hero.levelRange
    return min === max ? `Lv ${String(min)}` : `Lv ${String(min)}–${String(max)}`
  }
  return 'Lv ?'
}

export const isMystery = (hero: Pick<Hero, 'level'>) => hero.level === null

/** Sorting value: Level, or the middle of a mystery recruit's range. */
export function levelValue(hero: Pick<Hero, 'level' | 'levelRange'>): number {
  if (hero.level !== null) return hero.level
  return hero.levelRange ? (hero.levelRange.min + hero.levelRange.max) / 2 : 0
}

/** Hero traits, in display order. */
export const TRAITS: Record<HeroTrait, { label: string; description: string }> = {
  steadfast: { label: 'Steadfast', description: 'Fights at a steady pace from one battle to the next.' },
  wild: { label: 'Wild', description: 'Swings between quiet battles and huge ones.' },
  mighty: { label: 'Mighty', description: 'Capable of devastating single battles.' }
}

const times = (value: number) => `${String(value)}×`
const percent = (value: number) => `${String(Math.round(value * 100))}%`

/** Synergy names and what they do. Descriptions use the league's values when known. */
export function synergyInfo(synergy: Synergy, rules?: StrategyRules): { label: string; description: string } {
  switch (synergy) {
    case 'orderAndChaos':
      return {
        label: 'Order & Chaos',
        description: `A Steadfast and a Wild hero fight side by side: ${rules ? `+${percent(rules.orderAndChaosBonus)}` : 'bonus'} party damage.`
      }
    case 'mightyChampion':
      return {
        label: 'Mighty Champion',
        description: `A Mighty Champion deals ${rules ? times(rules.mightyChampionMultiplier) : 'extra'} damage${rules ? ` instead of ${times(rules.championMultiplier)}` : ''}.`
      }
    case 'bulwark':
      return {
        label: 'Bulwark',
        description: `A Wild Champion guarded by a Steadfast ally deals at least ${rules ? String(rules.bulwarkFloor) : 'a minimum of'} damage.`
      }
  }
}

export const SYNERGY_ORDER: Synergy[] = ['orderAndChaos', 'mightyChampion', 'bulwark']

/**
 * Synergies a lineup would trigger, from who is set to fight. Mirrors the server's rules
 * (api/src/modules/season/strategy.ts); the server decides the real result.
 */
export function activeSynergies(fighters: readonly Pick<Hero, 'id' | 'traits'>[], championId: string | null): Synergy[] {
  const has = (trait: HeroTrait, except?: string) => fighters.some(hero => hero.id !== except && hero.traits.includes(trait))
  const champion = fighters.find(hero => hero.id === championId)
  const active: Synergy[] = []
  if (has('steadfast') && has('wild')) active.push('orderAndChaos')
  if (champion?.traits.includes('mighty')) active.push('mightyChampion')
  if (champion?.traits.includes('wild') && has('steadfast', champion.id)) active.push('bulwark')
  return active
}

/**
 * A projected party total: starters who'll fight, with the Champion's multiplier, Bulwark's floor, and the
 * Order & Chaos bonus. Mirrors the server's battle math (api/src/modules/season/strategy.ts) so the Party
 * tab can update as the lineup changes; the server's projections in the matchup are the reference.
 */
export function projectedTotal(
  fighters: readonly (Pick<Hero, 'id' | 'traits'> & { projected: number })[],
  championId: string | null,
  rules: StrategyRules
): number {
  const synergies = activeSynergies(fighters, championId)
  let total = 0
  for (const hero of fighters) {
    if (hero.id !== championId) {
      total += hero.projected
      continue
    }
    const boosted = hero.projected * (synergies.includes('mightyChampion') ? rules.mightyChampionMultiplier : rules.championMultiplier)
    total += synergies.includes('bulwark') ? Math.max(boosted, rules.bulwarkFloor) : boosted
  }
  if (synergies.includes('orderAndChaos')) total *= 1 + rules.orderAndChaosBonus
  return Math.round(total)
}

/** Each class's name for a natural 20 and a natural 1. Flavor only. */
export const CRIT_NAMES: Record<HeroClass, Record<Crit, string>> = {
  Mage: { success: 'Arcane Surge', fail: 'Spell Fizzles' },
  Warrior: { success: 'Cleave', fail: 'Stumble' },
  Ranger: { success: 'Bullseye', fail: 'Snapped Bowstring' },
  Rogue: { success: 'Sneak Attack', fail: 'Caught in the Act' },
  Paladin: { success: 'Divine Smite', fail: 'Shield Shattered' }
}

/** "Natural 20 · Cleave" */
export function critLabel(crit: Crit, heroClass: string): string {
  const name = (CRIT_NAMES as Record<string, Record<Crit, string> | undefined>)[heroClass]?.[crit]
  const roll = crit === 'success' ? 'Natural 20' : 'Natural 1'
  return name ? `${roll} · ${name}` : roll
}
