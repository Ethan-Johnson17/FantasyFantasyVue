/*
 * Weekly battle math. Pure. Amounts are compared in hundredths so equal scores are truly equal.
 * Rules: docs/CLASSIC_SCORING.md, "Weekly faceoff resolution".
 */

export interface PartyBattleScore {
  /** Sum of the starting lineup's points */
  total: number
  /** Highest single starter (tiebreaker 1) */
  top: number
  /** Sum of the bench (tiebreaker 2) */
  bench: number
}

export type Outcome = 'home' | 'away' | 'draw'

const hundredths = (points: number) => Math.round(points * 100)

export function scoreParty(starterPoints: readonly number[], benchPoints: readonly number[]): PartyBattleScore {
  const sum = (values: readonly number[]) => hundredths(values.reduce((total, value) => total + value, 0)) / 100
  return {
    total: sum(starterPoints),
    top: starterPoints.length ? Math.max(...starterPoints) : 0,
    bench: sum(benchPoints)
  }
}

/** Higher total wins; then the highest single starter; then the bench total; otherwise a draw. */
export function decideBattle(home: PartyBattleScore, away: PartyBattleScore): Outcome {
  for (const key of ['total', 'top', 'bench'] as const) {
    const difference = hundredths(home[key]) - hundredths(away[key])
    if (difference !== 0) return difference > 0 ? 'home' : 'away'
  }
  return 'draw'
}

/** A party facing the monster: totals only (the monster has no heroes to break ties). */
export function decideMonsterBattle(party: PartyBattleScore, monsterTotal: number): Outcome {
  const difference = hundredths(party.total) - hundredths(monsterTotal)
  if (difference === 0) return 'draw'
  return difference > 0 ? 'home' : 'away'
}

/** The monster's damage: the league-average party total that week. */
export function monsterDamage(partyTotals: readonly number[]): number {
  if (partyTotals.length === 0) return 0
  return hundredths(partyTotals.reduce((total, value) => total + value, 0) / partyTotals.length) / 100
}
