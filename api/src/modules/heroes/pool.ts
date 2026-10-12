import { HERO_CLASSES, POOL_PER_PARTY, type HeroClass } from './classes.js'

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
}

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
}

/** Up to this share of each class's pool is mystery recruits. */
export const MYSTERY_SHARE = 0.2

export function mysteryRange(draftRound: number): LevelRange {
  if (draftRound <= 1) return { min: 6, max: 10 }
  if (draftRound === 2) return { min: 4, max: 9 }
  if (draftRound === 3) return { min: 3, max: 8 }
  return { min: 1, max: 6 }
}

/** The value used to compare heroes when no ranking applies: Level, or a mystery range's midpoint. */
export function expectedLevel(entry: { level?: number | null; levelRange?: LevelRange | null }): number {
  if (entry.level !== null && entry.level !== undefined) return entry.level
  if (entry.levelRange) return (entry.levelRange.min + entry.levelRange.max) / 2
  return 0
}

export function selectHeroPool(candidates: readonly PoolCandidate[], partyCount: number): PoolEntry[] {
  return HERO_CLASSES.flatMap(heroClass => {
    const need = POOL_PER_PARTY[heroClass] * partyCount
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
    return [
      ...takenVeterans.map((candidate, index) => ({
        sourceKind: candidate.sourceKind,
        sourceId: candidate.sourceId,
        heroClass,
        // Deciles: the top 10% of the class's veterans are Level 10.
        level: 10 - Math.floor((index * 10) / n),
        levelRange: null
      })),
      ...takenRecruits.map(candidate => ({
        sourceKind: candidate.sourceKind,
        sourceId: candidate.sourceId,
        heroClass,
        level: null,
        levelRange: mysteryRange(candidate.draft.round)
      }))
    ]
  })
}
