import { computed, inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import type { ApiClient } from './api/client'
import type { LeagueDetail, Party } from './api/types'

/** The open league, loaded once by the league layout and shared with every tab. */
export interface LeagueContext {
  league: Ref<LeagueDetail | null>
  myParty: Readonly<Ref<Party | null>>
  error: Ref<unknown>
  reload(): Promise<void>
}

const leagueKey: InjectionKey<LeagueContext> = Symbol('league')

export function provideLeague(api: ApiClient, leagueId: () => string): LeagueContext {
  const league = ref<LeagueDetail | null>(null)
  const error = ref<unknown>(null)
  const context: LeagueContext = {
    league,
    myParty: computed(() => league.value?.parties.find(party => party.isMine) ?? null),
    error,
    async reload() {
      try {
        league.value = await api.getLeague(leagueId())
        error.value = null
      } catch (caught) {
        error.value = caught
      }
    }
  }
  provide(leagueKey, context)
  return context
}

export function useLeague(): LeagueContext {
  const context = inject(leagueKey)
  if (!context) throw new Error('useLeague() must be used inside the league layout')
  return context
}

/** For tests: provide a fixed league without the layout. */
export function provideLeagueForTest(league: LeagueDetail, reload: () => Promise<void> = () => Promise.resolve()) {
  const value = ref(league)
  const context: LeagueContext = {
    league: value,
    myParty: computed(() => value.value.parties.find(party => party.isMine) ?? null),
    error: ref(null),
    reload
  }
  return { [leagueKey as symbol]: context }
}
