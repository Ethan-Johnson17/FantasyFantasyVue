/** Hero classes and their traits. Values come from the original hero generator (FantasyFantasy.client/src/heroes.js). */

export const HERO_CLASSES = ['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin'] as const
export type HeroClass = (typeof HERO_CLASSES)[number]

export type SourcePosition = 'QB' | 'RB' | 'WR' | 'TE' | 'DEF'

export const CLASS_BY_POSITION: Readonly<Record<SourcePosition, HeroClass>> = {
  QB: 'Mage',
  RB: 'Warrior',
  WR: 'Ranger',
  TE: 'Rogue',
  DEF: 'Paladin'
}

export interface ClassTraits {
  races: readonly [string, string]
  weapon: string
  skill: string
  /** Share of heroes generated as male (the original generator's weighting) */
  maleShare: number
  base: { attack: number; defense: number; magic: number }
}

export const CLASS_TRAITS: Readonly<Record<HeroClass, ClassTraits>> = {
  Mage: {
    races: ['Gnome', 'Elf'],
    weapon: 'Staff',
    skill: 'Fireball',
    maleShare: 2 / 3,
    base: { attack: 8, defense: 8, magic: 10 }
  },
  Warrior: {
    races: ['Half-orc', 'Dwarf'],
    weapon: 'Sword and Shield',
    skill: 'Shield Bash',
    maleShare: 3 / 4,
    base: { attack: 11, defense: 10, magic: 8 }
  },
  Ranger: {
    races: ['Human', 'Elf'],
    weapon: 'Bow',
    skill: 'Power Shot',
    maleShare: 2 / 3,
    base: { attack: 10, defense: 8, magic: 8 }
  },
  Rogue: {
    races: ['Human', 'Halfling'],
    weapon: 'Dagger',
    skill: 'Sneak',
    maleShare: 2 / 3,
    base: { attack: 9, defense: 8, magic: 8 }
  },
  Paladin: {
    races: ['Dragonborn', 'Aarakocra'],
    weapon: 'Spear',
    skill: 'Minor Self-heal',
    maleShare: 3 / 4,
    base: { attack: 10, defense: 11, magic: 9 }
  }
}

/** Pool heroes per party, by class: about 2.3x what a roster of 10 needs. */
export const POOL_PER_PARTY: Readonly<Record<HeroClass, number>> = {
  Mage: 4,
  Warrior: 6,
  Ranger: 6,
  Rogue: 4,
  Paladin: 3
}

/** 6 starters (one per class plus FLEX) and 4 on the bench */
export const ROSTER_SIZE = 10
/** One required lineup slot per class */
export const FIXED_SLOTS: readonly HeroClass[] = HERO_CLASSES
/** Classes allowed in the FLEX slot */
export const FLEX_CLASSES: readonly HeroClass[] = ['Warrior', 'Ranger', 'Rogue']
