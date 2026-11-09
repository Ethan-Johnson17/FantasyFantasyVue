/**
 * A party's crest: an emblem on a shield in a banner color, optionally split by a pattern into a second (accent)
 * color. A mascot emblem can also be recolored: its two color regions each take a mascot color, or keep the art's own.
 * Fixed sets keep every crest legible on the app's dark theme. Clients draw everything; the API stores only the keys.
 */

export const CREST_HERALDRY = ['crown', 'swords', 'tower', 'moon', 'flame', 'oak', 'lightning', 'paw'] as const
/** The original FantasyFantasy team builder's art */
export const CREST_MASCOTS = [
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
export const CREST_EMBLEMS = [...CREST_HERALDRY, ...CREST_MASCOTS] as const
export const CREST_BANNERS = ['crimson', 'sapphire', 'emerald', 'amethyst', 'amber', 'obsidian'] as const
/** Colors for a mascot's two regions: the banner colors, plus white and black */
export const CREST_MASCOT_COLORS = [...CREST_BANNERS, 'white', 'black'] as const
/** How the shield is divided between the banner and the accent color */
export const CREST_PATTERNS = ['plain', 'split', 'diagonal', 'chevron', 'quartered', 'stripe'] as const

export type CrestEmblem = (typeof CREST_EMBLEMS)[number]
export type CrestBanner = (typeof CREST_BANNERS)[number]
export type CrestPattern = (typeof CREST_PATTERNS)[number]
export type CrestMascotColor = (typeof CREST_MASCOT_COLORS)[number]

export interface Crest {
  emblem: CrestEmblem
  banner: CrestBanner
  pattern: CrestPattern
  /** The pattern's second color; null on a plain shield */
  accent: CrestBanner | null
  /** A mascot's recolored regions; null keeps the art's own color (always null on heraldic emblems) */
  mascotPrimary: CrestMascotColor | null
  mascotSecondary: CrestMascotColor | null
}

/** Used if a stored crest is ever missing, so views stay valid. */
export const DEFAULT_CREST: Crest = {
  emblem: 'crown',
  banner: 'crimson',
  pattern: 'plain',
  accent: null,
  mascotPrimary: null,
  mascotSecondary: null
}

interface StoredCrest {
  emblem?: string | null
  banner?: string | null
  pattern?: string | null
  accent?: string | null
  mascotPrimary?: string | null
  mascotSecondary?: string | null
}

const isEmblem = (value: unknown): value is CrestEmblem => CREST_EMBLEMS.includes(value as CrestEmblem)
const isBanner = (value: unknown): value is CrestBanner => CREST_BANNERS.includes(value as CrestBanner)
const isPattern = (value: unknown): value is CrestPattern => CREST_PATTERNS.includes(value as CrestPattern)
const isMascotColor = (value: unknown): value is CrestMascotColor => CREST_MASCOT_COLORS.includes(value as CrestMascotColor)
export const isMascot = (emblem: CrestEmblem) => (CREST_MASCOTS as readonly string[]).includes(emblem)

/**
 * A stored crest as the API shows it. Crests made before patterns existed are plain; a pattern without a valid,
 * different accent falls back to plain, and unknown or heraldic mascot colors drop, so every crest shown can be drawn.
 */
export function toCrest(stored: StoredCrest | null | undefined): Crest {
  if (!stored || !isEmblem(stored.emblem) || !isBanner(stored.banner)) return DEFAULT_CREST
  const patterned = isPattern(stored.pattern) && stored.pattern !== 'plain' && isBanner(stored.accent) && stored.accent !== stored.banner
  return {
    emblem: stored.emblem,
    banner: stored.banner,
    pattern: patterned && isPattern(stored.pattern) ? stored.pattern : 'plain',
    accent: patterned && isBanner(stored.accent) ? stored.accent : null,
    mascotPrimary: isMascot(stored.emblem) && isMascotColor(stored.mascotPrimary) ? stored.mascotPrimary : null,
    mascotSecondary: isMascot(stored.emblem) && isMascotColor(stored.mascotSecondary) ? stored.mascotSecondary : null
  }
}
