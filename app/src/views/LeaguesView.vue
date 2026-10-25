<script setup lang="ts">
import { useAuth0 } from '@auth0/auth0-vue'
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '../api/client'
import { useApi } from '../api/inject'
import type { MyLeague } from '../api/types'
import { unreadText } from '../chat'
import CrestShield from '../components/CrestShield.vue'
import InstallCard from '../components/InstallCard.vue'
import NamePrompt from '../components/NamePrompt.vue'
import { pickSpotlight } from '../spotlight'
import { useSessionStore } from '../stores/session'
import { nextBattleAt, seasonWeeksOf, timeUntil } from '../time'

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
const spotlight = computed(() => (leagues.value ? pickSpotlight(leagues.value) : null))

const ordinal = (n: number) => {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${String(n)}${suffix}`
}
const OUTCOME = { win: 'Victory', loss: 'Defeat', draw: 'Draw' } as const
const SPOTLIGHT_TITLE = { battle: 'Up next', draft: 'Draft day', gather: 'Gather your party', finale: 'Season complete' } as const
const plural = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? '' : 's'}`

/** The one thing worth doing next in an active league. */
function nextStep(league: MyLeague): string {
  const battle = league.outlook.nextBattle
  if (!battle) return 'Check your lineup ›'
  if (battle.noChampion) return 'Name a Champion ›'
  if (battle.restingStarters) return `${plural(battle.restingStarters, 'starter')} resting ›`
  return '✓ Lineup ready'
}

/** Each card opens where its call to action points. */
function cardLink(league: MyLeague): string {
  const base = `/leagues/${league.id}`
  const battle = league.status === 'active' ? league.outlook.nextBattle : null
  if (battle && (battle.noChampion || battle.restingStarters)) return `${base}/party`
  if (league.status === 'drafting') return `${base}/heroes`
  if (league.status === 'complete') return `${base}/finale`
  return base
}

function statusLine(league: MyLeague): { label: string; detail: string; callout?: string } {
  switch (league.status) {
    case 'active': {
      const week = Math.min(league.resolvedWeeks + 1, seasonWeeksOf(league))
      const nextAt = league.nextResolvesAt
        ? new Date(league.nextResolvesAt)
        : league.weekOneAt
          ? nextBattleAt(league.weekOneAt, league.resolvedWeeks, league.cadence)
          : null
      const next = nextAt ? timeUntil(nextAt) : ''
      return { label: `Week ${String(week)}`, detail: `Next battle ${next}`, callout: nextStep(league) }
    }
    case 'drafting':
      return {
        label: 'Draft soon',
        detail: league.draftAt ? `Draft ${timeUntil(new Date(league.draftAt))}` : 'Draft scheduled',
        callout: league.outlook.ranking?.ranked
          ? `Ranked ${String(league.outlook.ranking.ranked)} of ${String(league.outlook.ranking.pool)} heroes ›`
          : 'Rank your heroes before the draft ›'
      }
    case 'forming':
      return { label: 'Gathering', detail: `${String(league.partyCount)} of ${String(league.maxParties)} parties` }
    case 'complete':
      return {
        label: 'Complete',
        detail: league.standing ? `Finished ${ordinal(league.standing.rank)}` : 'Season finished',
        callout: 'See the finale ›'
      }
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
        <RouterLink to="/account" class="avatar" aria-label="Your account">{{ initial }}</RouterLink>
        <button type="button" class="sign-out" @click="signOut">Sign out</button>
      </div>
    </header>

    <NamePrompt v-if="session.needsName()" />

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!leagues" class="muted" aria-busy="true">Loading your leagues…</p>

    <template v-else>
      <!-- Up next: the soonest battle or draft across my leagues -->
      <section v-if="spotlight" class="spotlight" :class="spotlight.kind" aria-labelledby="spotlight-title">
        <div id="spotlight-title" class="spot-eyebrow">
          {{ SPOTLIGHT_TITLE[spotlight.kind] }} · {{ spotlight.league.name }}
        </div>

        <template v-if="spotlight.kind === 'battle'">
          <div class="faceoff">
            <div class="spot-side">
              <CrestShield :crest="spotlight.league.myParty.crest" :size="56" />
              <span class="spot-name">{{ spotlight.league.myParty.name }}</span>
            </div>
            <span class="spot-vs">vs</span>
            <div class="spot-side">
              <CrestShield v-if="spotlight.battle.opponent" :crest="spotlight.battle.opponent.crest" :size="56" />
              <span v-else class="monster-mark" aria-hidden="true">☠</span>
              <span class="spot-name">{{ spotlight.battle.opponent?.name ?? spotlight.battle.monster ?? 'Dungeon monster' }}</span>
            </div>
          </div>
          <div class="countdown">Week {{ spotlight.battle.week }} · battle {{ timeUntil(new Date(spotlight.battle.at)) }}</div>
          <ul class="alerts">
            <li v-if="spotlight.battle.noChampion" class="alert warn">♛ No Champion named</li>
            <li v-if="spotlight.battle.restingStarters" class="alert warn">{{ plural(spotlight.battle.restingStarters, 'starter') }} resting</li>
            <li v-if="!spotlight.battle.noChampion && !spotlight.battle.restingStarters" class="alert ok">✓ Lineup ready</li>
          </ul>
          <div class="spot-actions">
            <RouterLink :to="`/leagues/${spotlight.league.id}/matchup`" class="btn btn-primary">See matchup</RouterLink>
            <RouterLink :to="`/leagues/${spotlight.league.id}/party`" class="btn btn-secondary">Set lineup</RouterLink>
          </div>
        </template>

        <template v-else-if="spotlight.kind === 'draft'">
          <div class="countdown big">Draft {{ timeUntil(new Date(spotlight.at)) }}</div>
          <template v-if="spotlight.ranking">
            <div
              class="progress"
              role="progressbar"
              :aria-valuenow="spotlight.ranking.ranked"
              aria-valuemin="0"
              :aria-valuemax="spotlight.ranking.pool"
              aria-label="Heroes ranked"
            >
              <div class="progress-fill" :style="{ width: `${Math.round((spotlight.ranking.ranked / Math.max(1, spotlight.ranking.pool)) * 100)}%` }"></div>
            </div>
            <p class="spot-text">
              {{ spotlight.ranking.ranked
                ? `You've ranked ${String(spotlight.ranking.ranked)} of ${String(spotlight.ranking.pool)} heroes.`
                : "You haven't ranked any heroes yet, so the draft would pick by Level alone." }}
            </p>
          </template>
          <div class="spot-actions single">
            <RouterLink :to="`/leagues/${spotlight.league.id}/heroes`" class="btn btn-primary">Rank heroes</RouterLink>
          </div>
        </template>

        <template v-else-if="spotlight.kind === 'finale'">
          <CrestShield :crest="spotlight.league.myParty.crest" :size="56" class="finale-crest" />
          <div class="countdown big">
            {{ spotlight.league.standing?.rank === 1 ? 'Champions!' : spotlight.league.standing ? `You finished ${ordinal(spotlight.league.standing.rank)}` : 'The season is over' }}
          </div>
          <div class="spot-actions single">
            <RouterLink :to="`/leagues/${spotlight.league.id}/finale`" class="btn btn-primary">See the finale</RouterLink>
          </div>
        </template>

        <template v-else>
          <p class="spot-text">
            {{ spotlight.league.partyCount }} of {{ spotlight.league.maxParties }} parties have joined. Share the PIN so friends can join.
          </p>
          <div v-if="spotlight.league.pin" class="spot-pin">{{ spotlight.league.pin }}</div>
          <div class="spot-actions single">
            <RouterLink :to="`/leagues/${spotlight.league.id}`" class="btn btn-primary">Open league</RouterLink>
          </div>
        </template>
      </section>

      <section v-else-if="leagues.length === 0" class="spotlight welcome">
        <svg class="welcome-mark" viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="var(--gold)" stroke-width="2" aria-hidden="true">
          <path d="M32 5l22 8v16c0 14-9.5 23-22 30C19.5 52 10 43 10 29V13z" />
          <path d="M32 20l3.4 7 7.6.9-5.6 5.2 1.5 7.6L32 37l-6.9 3.7 1.5-7.6-5.6-5.2 7.6-.9z" />
        </svg>
        <p class="spot-text">You haven't joined a league yet. Host one for your friends, join with a PIN, or find a public league.</p>
      </section>

      <h2 v-if="leagues.length" class="section-title list-title">All leagues</h2>
      <ul class="leagues">
        <li v-for="league in leagues" :key="league.id">
          <RouterLink :to="cardLink(league)" class="card league" :class="{ highlight: league.status === 'active' }">
            <div class="league-top">
              <span class="league-name">{{ league.name }}<span v-if="league.mode === 'crossover'" class="mode-tag"> · Crossover</span></span>
              <span v-if="league.unreadChat" class="unread" :aria-label="`${unreadText(league.unreadChat)} unread chat messages`">
                {{ unreadText(league.unreadChat) }} new
              </span>
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
            <div v-if="league.standing || league.outlook.lastBattle" class="league-record">
              <span v-if="league.standing" class="rank">
                {{ ordinal(league.standing.rank) }} · {{ league.standing.wins }}–{{ league.standing.losses
                }}<template v-if="league.standing.draws">–{{ league.standing.draws }}</template>
              </span>
              <span v-if="league.outlook.lastBattle" class="last" :class="league.outlook.lastBattle.outcome">
                {{ OUTCOME[league.outlook.lastBattle.outcome] }} {{ Math.round(league.outlook.lastBattle.myTotal) }}–{{
                  Math.round(league.outlook.lastBattle.theirTotal)
                }}
                <span class="muted">vs {{ league.outlook.lastBattle.opponentName }}</span>
              </span>
            </div>
            <div v-if="statusLine(league).callout" class="callout">{{ statusLine(league).callout }}</div>
          </RouterLink>
        </li>
      </ul>
    </template>

    <div class="actions">
      <RouterLink to="/leagues/new" class="btn btn-primary">Host a league</RouterLink>
      <RouterLink to="/join" class="btn btn-secondary">Join with PIN</RouterLink>
      <RouterLink to="/leagues/find" class="btn btn-secondary find">Find a public league</RouterLink>
    </div>
    <InstallCard />
    <RouterLink to="/how-it-works" class="how-link">How it works</RouterLink>
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
.how-link {
  display: block;
  margin-top: 16px;
  text-align: center;
  font-size: 14px;
}
.find {
  grid-column: 1 / -1;
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
  text-decoration: none;
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
.unread {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 9px;
  background: var(--gold);
  color: var(--on-gold);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
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
.spotlight {
  position: relative;
  margin-top: 4px;
  padding: 18px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--gold);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--gold) 16%, transparent), transparent 70%),
    var(--surface);
  box-shadow:
    0 0 0 3px var(--ink),
    0 0 0 4px var(--line-strong),
    0 10px 30px rgb(0 0 0 / 35%);
  text-align: center;
}
.spot-eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gold);
}
.faceoff {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.spot-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.spot-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 19px;
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.spot-vs {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--text-muted);
}
.monster-mark {
  font-size: 40px;
  line-height: 56px;
  color: var(--danger);
}
.countdown {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
}
.countdown.big {
  font-size: 30px;
}
.alerts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.alert {
  padding: 2px 10px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 14px;
}
.alert.warn {
  color: var(--danger);
}
.alert.ok {
  color: var(--trait-steadfast);
}
.spot-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.spot-actions.single {
  grid-template-columns: minmax(0, 1fr);
}
.progress {
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--line);
}
.progress-fill {
  height: 100%;
  background: var(--gold);
}
.spot-text {
  margin: 0;
  line-height: 1.45;
}
.spot-pin {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 34px;
  letter-spacing: 0.18em;
}
.finale-crest {
  align-self: center;
}
.welcome-mark {
  align-self: center;
}
.list-title {
  margin: 20px 0 0;
  font-size: 20px;
}
.league-record {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 14px;
}
.rank {
  font-weight: 700;
}
.last.win {
  color: var(--gold);
}
.last.loss {
  color: var(--danger);
}
.actions {
  margin-top: auto;
  padding-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.mode-tag {
  color: var(--gold);
  font-size: 13px;
  font-weight: 700;
}
</style>
