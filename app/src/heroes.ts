import type { Hero, HeroClass } from './api/types'

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
