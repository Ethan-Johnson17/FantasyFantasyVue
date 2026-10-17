import type { MyLeague, PartyOutlook } from './api/types'

/*
 * Which league leads My leagues: whatever happens soonest, a battle or a draft. With neither, a
 * league I'm hosting that is still gathering parties, so I remember to share the PIN.
 */

export type Spotlight =
  | { kind: 'battle'; league: MyLeague; battle: NonNullable<PartyOutlook['nextBattle']> }
  | { kind: 'draft'; league: MyLeague; at: string; ranking: PartyOutlook['ranking'] }
  | { kind: 'gather'; league: MyLeague }

export function pickSpotlight(leagues: readonly MyLeague[]): Spotlight | null {
  const timed = leagues.flatMap((league): { at: number; spotlight: Spotlight }[] => {
    const battle = league.status === 'active' ? league.outlook.nextBattle : null
    if (battle) return [{ at: Date.parse(battle.at), spotlight: { kind: 'battle', league, battle } }]
    if (league.status === 'drafting' && league.draftAt) {
      return [{ at: Date.parse(league.draftAt), spotlight: { kind: 'draft', league, at: league.draftAt, ranking: league.outlook.ranking } }]
    }
    return []
  })
  const soonest = timed.sort((a, b) => a.at - b.at)[0]
  if (soonest) return soonest.spotlight
  const gathering = leagues.find(league => league.status === 'forming' && league.isHost)
  return gathering ? { kind: 'gather', league: gathering } : null
}
