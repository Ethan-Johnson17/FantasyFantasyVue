import { runDueDraft } from '../draft/draft.service.js'
import { refreshSoloPool } from '../solo/solo.service.js'
import { resolveDueWeeks } from './season.service.js'

/**
 * Brings a league up to date: runs a due draft, then resolves due game weeks, and for a Solo run brings its pool up to
 * the latest final NFL week. Leagues advance lazily, whenever someone opens them, so no always-on background worker
 * is needed.
 */
export async function advanceLeague(leagueId: string): Promise<void> {
  await runDueDraft(leagueId)
  await resolveDueWeeks(leagueId)
  await refreshSoloPool(leagueId)
}
