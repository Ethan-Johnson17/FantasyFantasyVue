import type { HeroClass } from '../heroes/classes.js'
import { HERO_TRAITS, type HeroTrait, type PoolCandidate } from '../heroes/pool.js'

/*
 * Dynasty experience (docs/DYNASTY_SPEC.md, "Experience"). A hero earns XP equal to the damage they deal for their
 * party, and keeps it while kept by that party. XP sets a tier; each tier adds a small damage bonus the next season,
 * and the top tier earns one trait for good. Pure: the numbers in, the effect out.
 */

/**
 * XP needed for tiers 1-4 (decided 2026-10-29). A strong season as a starter (about 330 XP) reaches tier 2; tier 4 takes
 * about two strong seasons. Simulated on real 3-season chains 2013-2025: keeping by Level wins 51.3% against 49.8% for
 * keeping nobody (with XP off, keepers alone gain nothing), and about 15% of keepers reach tier 4.
 */
export const XP_TIERS: readonly number[] = [150, 300, 450, 600]
/** Damage bonus per tier: tier 4 deals +4%. */
export const XP_BONUS_PER_TIER = 0.01
export const TOP_XP_TIER = XP_TIERS.length

export function xpTier(xp: number): number {
  return XP_TIERS.filter(threshold => xp >= threshold).length
}

/** The damage multiplier for a hero carrying this much XP into the season. */
export function xpMultiplier(xp: number): number {
  return 1 + xpTier(xp) * XP_BONUS_PER_TIER
}

export interface XpView {
  /** XP carried into this season */
  xp: number
  tier: number
  /** Damage bonus this season, e.g. 0.02 for +2% */
  bonus: number
  /** XP for the next tier, or null at the top */
  nextTierAt: number | null
}

export function xpView(xp: number): XpView {
  const tier = xpTier(xp)
  return { xp: Math.round(xp), tier, bonus: tier * XP_BONUS_PER_TIER, nextTierAt: XP_TIERS[tier] ?? null }
}

/**
 * The trait a hero earns on reaching the top tier: the one they're closest to qualifying for among their class this
 * season (by percentile), never one that conflicts with a trait they have (Steadfast and Wild exclude each other).
 */
export function chooseEarnedTrait(
  hero: { heroClass: HeroClass; traits: readonly HeroTrait[]; volatility?: number; ceiling?: number },
  classmates: readonly PoolCandidate[]
): HeroTrait | null {
  const peers = classmates.filter(candidate => candidate.heroClass === hero.heroClass && candidate.volatility !== undefined)
  const share = (better: (candidate: PoolCandidate) => boolean) => (peers.length ? peers.filter(better).length / peers.length : 0)
  const options: { trait: HeroTrait; standing: number }[] = []
  const hasTemperament = hero.traits.includes('steadfast') || hero.traits.includes('wild')
  if (!hasTemperament && hero.volatility !== undefined) {
    const volatility = hero.volatility
    // Share of the class the hero is steadier (or swingier) than.
    options.push({ trait: 'steadfast', standing: share(candidate => (candidate.volatility ?? 0) > volatility) })
    options.push({ trait: 'wild', standing: share(candidate => (candidate.volatility ?? 0) < volatility) })
  }
  if (!hero.traits.includes('mighty')) {
    const ceiling = hero.ceiling ?? 0
    options.push({ trait: 'mighty', standing: share(candidate => (candidate.ceiling ?? 0) < ceiling) })
  }
  // A hero with no history to compare still earns Mighty, unless they have every trait they can.
  if (options.length === 0) return null
  return options.sort((a, b) => b.standing - a.standing || a.trait.localeCompare(b.trait))[0]?.trait ?? null
}

/** A hero's traits this season: their own, plus an earned one unless it conflicts with them. */
export function withEarnedTrait(traits: readonly HeroTrait[], earned: HeroTrait | null | undefined): HeroTrait[] {
  if (!earned || traits.includes(earned)) return [...traits]
  const conflicts = (earned === 'steadfast' && traits.includes('wild')) || (earned === 'wild' && traits.includes('steadfast'))
  if (conflicts) return [...traits]
  // Same order as pool traits: temperament first, then might.
  return HERO_TRAITS.filter(trait => trait === earned || traits.includes(trait))
}
