/**
 * A party's crest: an emblem on a shield in a banner color, optionally split by a pattern into a second (accent)
 * color. Fixed sets keep every crest legible on the app's dark theme. Clients draw the emblems and patterns; the API
 * stores only the keys.
 */

/** Heraldic emblems, then mascots (the original FantasyFantasy team builder's art) */
export const CREST_EMBLEMS = [
  'crown',
  'swords',
  'tower',
  'moon',
  'flame',
  'oak',
  'lightning',
  'paw',
  'raccoon',
  'wolf',
  'fox',
  'phoenix',
  'knight',
  'bear',
  'tiger',
  'husky',
  'buck',
  'samurai',
  'dragon',
  'joker'
] as const
export const CREST_BANNERS = ['crimson', 'sapphire', 'emerald', 'amethyst', 'amber', 'obsidian'] as const
/** How the shield is divided between the banner and the accent color */
export const CREST_PATTERNS = ['plain', 'split', 'diagonal', 'chevron', 'quartered', 'stripe'] as const

export type CrestEmblem = (typeof CREST_EMBLEMS)[number]
export type CrestBanner = (typeof CREST_BANNERS)[number]
export type CrestPattern = (typeof CREST_PATTERNS)[number]

export interface Crest {
  emblem: CrestEmblem
  banner: CrestBanner
  pattern: CrestPattern
  /** The pattern's second color; null on a plain shield */
  accent: CrestBanner | null
}

/** Used if a stored crest is ever missing, so views stay valid. */
export const DEFAULT_CREST: Crest = { emblem: 'crown', banner: 'crimson', pattern: 'plain', accent: null }

interface StoredCrest {
  emblem?: string | null
  banner?: string | null
  pattern?: string | null
  accent?: string | null
}

const isEmblem = (value: unknown): value is CrestEmblem => CREST_EMBLEMS.includes(value as CrestEmblem)
const isBanner = (value: unknown): value is CrestBanner => CREST_BANNERS.includes(value as CrestBanner)
const isPattern = (value: unknown): value is CrestPattern => CREST_PATTERNS.includes(value as CrestPattern)

/**
 * A stored crest as the API shows it. Crests made before patterns existed are plain; a pattern without a valid,
 * different accent falls back to plain, so every crest shown can be drawn.
 */
export function toCrest(stored: StoredCrest | null | undefined): Crest {
  if (!stored || !isEmblem(stored.emblem) || !isBanner(stored.banner)) return DEFAULT_CREST
  const patterned = isPattern(stored.pattern) && stored.pattern !== 'plain' && isBanner(stored.accent) && stored.accent !== stored.banner
  return {
    emblem: stored.emblem,
    banner: stored.banner,
    pattern: patterned && isPattern(stored.pattern) ? stored.pattern : 'plain',
    accent: patterned && isBanner(stored.accent) ? stored.accent : null
  }
}
