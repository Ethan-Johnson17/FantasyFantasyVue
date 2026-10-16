import type { PoolRules } from '../scoring/rulesets.js'
import { HERO_CLASSES, type HeroClass } from './classes.js'

/*
 * Hero pool selection and Levels. Pure: candidates in, pool out.
 * Rules: docs/CLASSIC_SCORING.md, "Season setup and draft".
 */

export interface PoolCandidate {
  sourceKind: 'player' | 'defense'
  /** NFL player id, or team code for defenses */
  sourceId: string
  heroClass: HeroClass
  /** Previous-season points per game; null for mystery recruits (rookies) */
  ppg: number | null
  /** NFL draft slot; required for mystery recruits */
  draft?: { round: number; pick: number }
  /** Previous-season swing relative to average (veterans) */
  volatility?: number
  /** Previous-season best single week (veterans) */
  ceiling?: number
}

export const HERO_TRAITS = ['steadfast', 'wild', 'mighty'] as const
export type HeroTrait = (typeof HERO_TRAITS)[number]

export interface LevelRange {
  min: number
  max: number
}

export interface PoolEntry {
  sourceKind: 'player' | 'defense'
  sourceId: string
  heroClass: HeroClass
  /** 1–10 for veterans; null for mystery recruits */
  level: number | null
  /** Shown instead of a level for mystery recruits */
  levelRange: LevelRange | null
  traits: HeroTrait[]
}

/** Up to this share of each class's pool is mystery recruits. */
export const MYSTERY_SHARE = 0.2

/**
 * Guidance shown for rookies, calibrated on 2012-2025 data: first-round rookies played like
 * Level 1-2 veterans on average (with upside), later rounds below Level 1.
 */
export function mysteryRange(draftRound: number): LevelRange {
  if (draftRound <= 1) return { min: 1, max: 4 }
  if (draftRound === 2) return { min: 1, max: 2 }
  return { min: 1, max: 1 }
}

/** The value used to compare heroes when no ranking applies: Level, or a mystery range's midpoint. */
export function expectedLevel(entry: { level?: number | null; levelRange?: LevelRange | null }): number {
  if (entry.level !== null && entry.level !== undefined) return entry.level
  if (entry.levelRange) return (entry.levelRange.min + entry.levelRange.max) / 2
  return 0
}

export function selectHeroPool(
  candidates: readonly PoolCandidate[],
  partyCount: number,
  rules: PoolRules
): PoolEntry[] {
  return HERO_CLASSES.flatMap(heroClass => {
    const need = rules.perParty[heroClass] * partyCount
    const ofClass = candidates.filter(candidate => candidate.heroClass === heroClass)

    const veterans = ofClass
      .filter((candidate): candidate is PoolCandidate & { ppg: number } => candidate.ppg !== null)
      .sort((a, b) => b.ppg - a.ppg || a.sourceId.localeCompare(b.sourceId))
    const recruits = ofClass
      .filter(
        (candidate): candidate is PoolCandidate & { draft: { round: number; pick: number } } =>
          candidate.ppg === null && candidate.draft !== undefined
      )
      .sort((a, b) => a.draft.pick - b.draft.pick || a.sourceId.localeCompare(b.sourceId))

    const recruitCap = Math.min(recruits.length, Math.floor(need * MYSTERY_SHARE))
    const takenVeterans = veterans.slice(0, need - recruitCap)
    // If veterans run short, more recruits fill the gap.
    const takenRecruits = recruits.slice(0, need - takenVeterans.length)
    if (takenVeterans.length + takenRecruits.length < need) {
      throw new Error(`Not enough ${heroClass} candidates for ${String(partyCount)} parties`)
    }

    const n = takenVeterans.length
    const traits = assignTraits(takenVeterans)
    return [
      ...takenVeterans.map((candidate, index) => ({
        sourceKind: candidate.sourceKind,
        sourceId: candidate.sourceId,
        heroClass,
        // Deciles: the top 10% of the class's veterans are Level 10.
        level: 10 - Math.floor((index * 10) / n),
        levelRange: null,
        traits: traits.get(candidate.sourceId) ?? []
      })),
      ...takenRecruits.map(candidate => ({
        sourceKind: candidate.sourceKind,
        sourceId: candidate.sourceId,
        heroClass,
        level: null,
        levelRange: mysteryRange(candidate.draft.round),
        traits: [] as HeroTrait[]
      }))
    ]
  })
}

/**
 * Traits by thirds within one class's veterans: the steadiest third are Steadfast, the swingiest
 * third Wild, and the top third by best single week Mighty. Ties break by id, so results are stable.
 */
export function assignTraits(veterans: readonly PoolCandidate[]): Map<string, HeroTrait[]> {
  const result = new Map<string, HeroTrait[]>(veterans.map(candidate => [candidate.sourceId, []]))
  const third = Math.floor(veterans.length / 3)
  if (third === 0) return result
  const add = (id: string, trait: HeroTrait) => result.get(id)?.push(trait)
  const byId = (a: PoolCandidate, b: PoolCandidate) => a.sourceId.localeCompare(b.sourceId)

  const bySwing = [...veterans].sort((a, b) => (a.volatility ?? 0) - (b.volatility ?? 0) || byId(a, b))
  for (const candidate of bySwing.slice(0, third)) add(candidate.sourceId, 'steadfast')
  for (const candidate of bySwing.slice(-third)) add(candidate.sourceId, 'wild')

  const byCeiling = [...veterans].sort((a, b) => (b.ceiling ?? 0) - (a.ceiling ?? 0) || byId(a, b))
  for (const candidate of byCeiling.slice(0, third)) add(candidate.sourceId, 'mighty')

  // Keep a stable order: temperament first, then might.
  for (const [id, list] of result) result.set(id, HERO_TRAITS.filter(trait => list.includes(trait)))
  return result
}
