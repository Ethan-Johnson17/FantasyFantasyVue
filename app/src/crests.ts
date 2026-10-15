/**
 * Crest emblems and banner colors. Keys must match the API (api/src/modules/leagues/crests.ts);
 * a test guards against drift. Emblem paths are drawn on a 24x24 grid.
 */

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
  }
] as const

export const BANNERS = [
  { key: 'crimson', name: 'Crimson', hex: '#B4432F' },
  { key: 'sapphire', name: 'Sapphire', hex: '#2F5DA8' },
  { key: 'emerald', name: 'Emerald', hex: '#2F7D4F' },
  { key: 'amethyst', name: 'Amethyst', hex: '#6E3FA3' },
  { key: 'amber', name: 'Amber', hex: '#A97A1F' },
  { key: 'obsidian', name: 'Obsidian', hex: '#3A3A44' }
] as const

export type EmblemKey = (typeof EMBLEMS)[number]['key']
export type BannerKey = (typeof BANNERS)[number]['key']

export interface Crest {
  emblem: EmblemKey
  banner: BannerKey
}

export const DEFAULT_CREST: Crest = { emblem: 'crown', banner: 'crimson' }

export function emblemOf(key: string) {
  return EMBLEMS.find(emblem => emblem.key === key) ?? EMBLEMS[0]
}

export function bannerOf(key: string) {
  return BANNERS.find(banner => banner.key === key) ?? BANNERS[0]
}

/** e.g. "Crimson Crown" */
export function crestName(crest: Crest): string {
  return `${bannerOf(crest.banner).name} ${emblemOf(crest.emblem).name}`
}
