/**
 * A party's crest: an emblem on a shield in a banner color. Fixed sets keep every crest legible
 * on the app's dark theme. Clients draw the emblems; the API stores only the keys.
 */

export const CREST_EMBLEMS = ['crown', 'swords', 'tower', 'moon', 'flame', 'oak', 'lightning', 'paw'] as const
export const CREST_BANNERS = ['crimson', 'sapphire', 'emerald', 'amethyst', 'amber', 'obsidian'] as const

export type CrestEmblem = (typeof CREST_EMBLEMS)[number]
export type CrestBanner = (typeof CREST_BANNERS)[number]

export interface Crest {
  emblem: CrestEmblem
  banner: CrestBanner
}

/** Used if a stored crest is ever missing, so views stay valid. */
export const DEFAULT_CREST: Crest = { emblem: 'crown', banner: 'crimson' }
