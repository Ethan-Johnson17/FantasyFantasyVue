/**
 * Crest emblems, banner colors and shield patterns. Keys must match the API (api/src/modules/leagues/crests.ts);
 * a test guards against drift. Heraldic emblem paths are drawn on a 24x24 grid; pattern paths on the shield's
 * 64x72. Mascots are images from the original FantasyFantasy team builder (src/assets/mascots); each has two color
 * regions whose paths read CSS variables (--m1-*, --m2-*), falling back to the art's own colors.
 */

import raccoonArt from './assets/mascots/raccoon.svg'
import wolfArt from './assets/mascots/wolf.svg'
import foxArt from './assets/mascots/fox.svg'
import phoenixArt from './assets/mascots/phoenix.svg'
import knightArt from './assets/mascots/knight.svg'
import bearArt from './assets/mascots/bear.svg'
import tigerArt from './assets/mascots/tiger.svg'
import huskyArt from './assets/mascots/husky.svg'
import buckArt from './assets/mascots/buck.svg'
import samuraiArt from './assets/mascots/samurai.svg'
import dragonArt from './assets/mascots/dragon.svg'
import jokerArt from './assets/mascots/joker.svg'

export const EMBLEMS = [
  { key: 'crown', name: 'Crown', path: 'M3 18h18l-1.5-10-4.5 4-3-7-3 7-4.5-4z M3 21h18' },
  { key: 'swords', name: 'Swords', path: 'M20.5 3.5L8 17L7 16Z M5.6 14.6L9.4 18.4 M7.5 16.5L5 19 M5.2 19.6a0.8 0.8 0 1 0-1.6 0a0.8 0.8 0 1 0 1.6 0 M3.5 3.5L16 17L17 16Z M18.4 14.6L14.6 18.4 M16.5 16.5L19 19 M20.4 19.6a0.8 0.8 0 1 0-1.6 0a0.8 0.8 0 1 0 1.6 0' },
  { key: 'tower', name: 'Tower', path: 'M6 21V9h12v12 M5 9V4h2.5v2h2V4h5v2h2V4H19v5 M10 21v-4a2 2 0 0 1 4 0v4' },
  {
    key: 'moon',
    name: 'Moon',
    path: 'M15 3.5a8.5 8.5 0 1 0 5.5 14A7 7 0 0 1 15 3.5z M18 6l.6 1.4L20 8l-1.4.6L18 10l-.6-1.4L16 8l1.4-.6z'
  },
  { key: 'flame', name: 'Flame', path: 'M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z' },
  { key: 'oak', name: 'Oak', path: 'M12 21V10 M12 3c4 2 6 6 4 10-1 2-3 3-4 3s-3-1-4-3c-2-4 0-8 4-10z M12 13l-3-2 M12 10l3-2' },
  { key: 'lightning', name: 'Storm', path: 'M13 2L5 14h6l-1 8 8-12h-6z' },
  {
    key: 'paw',
    name: 'Beast',
    path: 'M8 15c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4-1.8-4-4z M6.5 9.5a1.6 1.6 0 1 0 0.01 0z M10 6.5a1.6 1.6 0 1 0 0.01 0z M14 6.5a1.6 1.6 0 1 0 0.01 0z M17.5 9.5a1.6 1.6 0 1 0 0.01 0z'
  },
  // Mascots: full-color art (Pixabay content license), drawn inside the shield
  { key: 'raccoon', name: 'Raccoon', mascot: true, image: raccoonArt },
  { key: 'wolf', name: 'Wolf', mascot: true, image: wolfArt },
  { key: 'fox', name: 'Fox', mascot: true, image: foxArt },
  { key: 'phoenix', name: 'Phoenix', mascot: true, image: phoenixArt },
  { key: 'knight', name: 'Knight', mascot: true, image: knightArt },
  { key: 'bear', name: 'Bear', mascot: true, image: bearArt },
  { key: 'tiger', name: 'Tiger', mascot: true, image: tigerArt },
  { key: 'husky', name: 'Husky', mascot: true, image: huskyArt },
  { key: 'buck', name: 'Buck', mascot: true, image: buckArt },
  { key: 'samurai', name: 'Samurai', mascot: true, image: samuraiArt },
  { key: 'dragon', name: 'Dragon', mascot: true, image: dragonArt },
  { key: 'joker', name: 'Joker', mascot: true, image: jokerArt }
] as const

export const BANNERS = [
  { key: 'crimson', name: 'Crimson', hex: '#B4432F' },
  { key: 'sapphire', name: 'Sapphire', hex: '#2F5DA8' },
  { key: 'emerald', name: 'Emerald', hex: '#2F7D4F' },
  { key: 'amethyst', name: 'Amethyst', hex: '#6E3FA3' },
  { key: 'amber', name: 'Amber', hex: '#A97A1F' },
  { key: 'obsidian', name: 'Obsidian', hex: '#3A3A44' }
] as const

/** Colors for a mascot's two regions: the banner colors, plus white and black */
export const MASCOT_COLORS = [
  ...BANNERS,
  { key: 'white', name: 'White', hex: '#F4EFE6' },
  { key: 'black', name: 'Black', hex: '#1A1820' }
] as const

/** How the shield divides between the banner and a second (accent) color. `area` is the accent's part. */
export const PATTERNS = [
  { key: 'plain', name: 'Plain', area: '' },
  { key: 'split', name: 'Split', area: 'M32 0H64V72H32z' },
  { key: 'diagonal', name: 'Diagonal', area: 'M0 0H64V72z' },
  { key: 'chevron', name: 'Chevron', area: 'M0 58L32 26 64 58V74L32 42 0 74z' },
  { key: 'quartered', name: 'Quartered', area: 'M32 0H64V36H32z M0 36H32V72H0z' },
  { key: 'stripe', name: 'Stripe', area: 'M24 0H40V72H24z' }
] as const

export type EmblemKey = (typeof EMBLEMS)[number]['key']
export type BannerKey = (typeof BANNERS)[number]['key']
export type PatternKey = (typeof PATTERNS)[number]['key']
export type MascotColorKey = (typeof MASCOT_COLORS)[number]['key']

export interface Crest {
  emblem: EmblemKey
  banner: BannerKey
  /** Plain when absent */
  pattern?: PatternKey
  /** The pattern's second color; null or absent on a plain shield */
  accent?: BannerKey | null
  /** A mascot's recolored regions; null or absent keeps the art's own color */
  mascotPrimary?: MascotColorKey | null
  mascotSecondary?: MascotColorKey | null
}

export const DEFAULT_CREST: Crest = {
  emblem: 'crown',
  banner: 'crimson',
  pattern: 'plain',
  accent: null,
  mascotPrimary: null,
  mascotSecondary: null
}

export const isMascot = (key: string) => EMBLEMS.some(emblem => emblem.key === key && 'image' in emblem)

/**
 * Each region path's shade is a step darker (b10..b90) or lighter (w10..w90) than the region's middle tone (0), so a
 * recolored mascot keeps its shading. These mix the chosen color the same way.
 */
const SHADES = ['0', ...[10, 20, 30, 40, 50, 60, 70, 80, 90].flatMap(step => [`b${step}`, `w${step}`])]

function regionVars(region: 1 | 2, key: string | null | undefined): Record<string, string> {
  const color = MASCOT_COLORS.find(entry => entry.key === key)
  if (!color) return {}
  return Object.fromEntries(
    SHADES.map(shade => {
      const mix = shade === '0' ? color.hex : `color-mix(in oklab, ${color.hex}, ${shade[0] === 'b' ? 'black' : 'white'} ${shade.slice(1)}%)`
      return [`--m${region}-${shade}`, mix]
    })
  )
}

/** CSS variables that recolor a mascot's regions; empty for heraldry or untouched mascots */
export function mascotColorVars(crest: Crest): Record<string, string> {
  if (!isMascot(crest.emblem)) return {}
  return { ...regionVars(1, crest.mascotPrimary), ...regionVars(2, crest.mascotSecondary) }
}

export function patternOf(key: string | undefined) {
  return PATTERNS.find(pattern => pattern.key === key) ?? PATTERNS[0]
}

/** The accent color, if the crest is patterned (and drawable: a known accent unlike the banner) */
export function accentOf(crest: Crest) {
  if (!crest.pattern || crest.pattern === 'plain' || !crest.accent || crest.accent === crest.banner) return null
  return BANNERS.find(banner => banner.key === crest.accent) ?? null
}

export function emblemOf(key: string) {
  return EMBLEMS.find(emblem => emblem.key === key) ?? EMBLEMS[0]
}

export function bannerOf(key: string) {
  return BANNERS.find(banner => banner.key === key) ?? BANNERS[0]
}

/** e.g. "Crimson Crown", or patterned "Obsidian and Amber Dragon" */
export function crestName(crest: Crest): string {
  const accent = accentOf(crest)
  const colors = accent ? `${bannerOf(crest.banner).name} and ${accent.name}` : bannerOf(crest.banner).name
  return `${colors} ${emblemOf(crest.emblem).name}`
}
