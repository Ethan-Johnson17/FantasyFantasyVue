<script setup lang="ts">
import { useAuth0 } from '@auth0/auth0-vue'
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '../api/client'
import { useApi } from '../api/inject'
import type { MyLeague } from '../api/types'
import CrestShield from '../components/CrestShield.vue'
import { useSessionStore } from '../stores/session'
import { nextBattleAt, SEASON_WEEKS, timeUntil } from '../time'

const api = useApi()
const session = useSessionStore()
const { logout } = useAuth0()

const leagues = ref<MyLeague[] | null>(null)
const error = ref('')

onMounted(async () => {
  try {
    leagues.value = await api.listMyLeagues()
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'We could not load your leagues.'
  }
})

const initial = computed(() => session.account?.displayName.charAt(0).toUpperCase() ?? '?')

function statusLine(league: MyLeague): { label: string; detail: string; callout?: string } {
  switch (league.status) {
    case 'active': {
      const week = Math.min(league.resolvedWeeks + 1, SEASON_WEEKS)
      const next = league.weekOneAt ? timeUntil(nextBattleAt(league.weekOneAt, league.resolvedWeeks, league.cadence)) : ''
      return { label: `Week ${String(week)}`, detail: `Next battle ${next}`, callout: 'Check your lineup ›' }
    }
    case 'drafting':
      return {
        label: 'Draft soon',
        detail: league.draftAt ? `Draft ${timeUntil(new Date(league.draftAt))}` : 'Draft scheduled',
        callout: 'Rank your heroes before the draft ›'
      }
    case 'forming':
      return { label: 'Gathering', detail: `${String(league.partyCount)} of ${String(league.maxParties)} parties` }
    case 'complete':
      return { label: 'Complete', detail: 'Season finished' }
    case 'canceled':
      return { label: 'Canceled', detail: 'This league was canceled' }
  }
}

function signOut() {
  void logout({ logoutParams: { returnTo: window.location.origin } })
}
</script>

<template>
  <main class="page">
    <header class="page-header top">
      <div>
        <div class="eyebrow">FantasyFantasy</div>
        <h1 class="title">Your leagues</h1>
      </div>
      <div class="account">
        <span class="avatar" aria-hidden="true">{{ initial }}</span>
        <button type="button" class="sign-out" @click="signOut">Sign out</button>
      </div>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!leagues" class="muted" aria-busy="true">Loading your leagues…</p>

    <template v-else>
      <p v-if="leagues.length === 0" class="card empty">
        You haven't joined a league yet. Host one for your friends, or join with a PIN.
      </p>
      <ul class="leagues">
        <li v-for="league in leagues" :key="league.id">
          <RouterLink :to="`/leagues/${league.id}`" class="card league" :class="{ highlight: league.status === 'active' }">
            <div class="league-top">
              <span class="league-name">{{ league.name }}</span>
              <span class="league-label">{{ statusLine(league).label }}</span>
            </div>
            <div class="league-party">
              <CrestShield :crest="league.myParty.crest" :size="28" />
              <span>{{ league.myParty.name }}</span>
              <span class="muted">· {{ statusLine(league).detail }}</span>
            </div>
            <div
              v-if="league.status === 'forming'"
              class="slots"
              role="img"
              :aria-label="`${league.partyCount} of ${league.maxParties} parties joined`"
            >
              <span v-for="slot in league.maxParties" :key="slot" class="slot" :class="{ filled: slot <= league.partyCount }"></span>
            </div>
            <div v-if="league.status === 'forming' && league.isHost && league.pin" class="muted">
              You're the host · PIN <strong class="pin">{{ league.pin }}</strong>
            </div>
            <div v-if="statusLine(league).callout" class="callout">{{ statusLine(league).callout }}</div>
          </RouterLink>
        </li>
      </ul>
    </template>

    <div class="actions">
      <RouterLink to="/leagues/new" class="btn btn-primary">Host a league</RouterLink>
      <RouterLink to="/join" class="btn btn-secondary">Join with PIN</RouterLink>
    </div>
  </main>
</template>

<style scoped>
.top {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.title {
  font-size: 34px;
}
.account {
  display: flex;
  align-items: center;
  gap: 4px;
}
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  background: var(--surface-raised);
  color: var(--gold);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sign-out {
  min-height: var(--tap);
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}
.sign-out:hover {
  color: var(--text);
}
.leagues {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.league {
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--text);
  text-decoration: none;
}
.league.highlight {
  border-color: var(--line-strong);
}
.league-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.league-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
}
.league-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--gold);
  white-space: nowrap;
}
.league-party {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  flex-wrap: wrap;
}
.slots {
  display: flex;
  gap: 6px;
}
.slot {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--line);
}
.slot.filled {
  background: var(--gold);
}
.pin {
  letter-spacing: 0.12em;
  color: var(--text);
}
.callout {
  font-size: 14px;
  color: var(--gold);
}
.empty {
  margin: 8px 0 0;
}
.actions {
  margin-top: auto;
  padding-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
</style>
