import { runDueDraft } from '../draft/draft.service.js'
import { resolveDueWeeks } from './season.service.js'

/**
 * Brings a league up to date: runs a due draft, then resolves due game weeks. Leagues advance
 * lazily, whenever someone opens them, so no always-on background worker is needed.
 */
export async function advanceLeague(leagueId: string): Promise<void> {
  await runDueDraft(leagueId)
  await resolveDueWeeks(leagueId)
}
