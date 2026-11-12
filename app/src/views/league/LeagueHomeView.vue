<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../../api/inject'
import type { Campaign, Playoffs, ScheduleWeek, Standing } from '../../api/types'
import CampaignBoard from '../../components/CampaignBoard.vue'
import CrestShield from '../../components/CrestShield.vue'
import FormError from '../../components/FormError.vue'
import PlayoffBracket from '../../components/PlayoffBracket.vue'
import { useLeague } from '../../league'
import { roundName } from '../../playoffs'
import { nextBattleAt, seasonWeeksOf, timeUntil } from '../../time'

const api = useApi()
const router = useRouter()
const { league, myParty, reload } = useLeague()

const standings = ref<Standing[]>([])
const schedule = ref<ScheduleWeek[]>([])
const playoffs = ref<Playoffs | null>(null)
/** Co-op and Solo: the campaign, in place of standings and battles */
const campaign = ref<Campaign | null>(null)
const coop = computed(() => league.value?.mode === 'coop')
/** Solo (docs/SOLO_SPEC.md): a private run of one party, with no PIN, draft, standings or chat */
const solo = computed(() => league.value?.mode === 'solo')
const busy = ref(false)
const error = ref<unknown>(null)
const copied = ref(false)

const MIN_LEAD_MS = 10 * 60 * 1000
const MAX_LEAD_MS = 14 * 24 * 60 * 60 * 1000

/** datetime-local wants "YYYY-MM-DDTHH:mm" in local time. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const draftInput = ref(toLocalInput(new Date(Date.now() + 60 * 60 * 1000)))
const draftMin = computed(() => toLocalInput(new Date(Date.now() + MIN_LEAD_MS)))
const draftMax = computed(() => toLocalInput(new Date(Date.now() + MAX_LEAD_MS)))

const isHost = computed(() => !!league.value?.isHost)
const inSeason = computed(() => league.value?.status === 'active' || league.value?.status === 'complete')
const seasonWeeks = computed(() => seasonWeeksOf(league.value))
const currentWeek = computed(() => {
  if (!league.value) return null
  if (league.value.status === 'complete') return seasonWeeks.value
  return Math.min(league.value.resolvedWeeks + 1, seasonWeeks.value)
})
const thisWeek = computed(() => schedule.value.find(week => week.week === currentWeek.value) ?? null)
/** Playoff weeks: the round being played */
const thisRound = computed(() => (currentWeek.value === null ? null : roundName(league.value?.playoffs, currentWeek.value)))
/** Playoffs: my party sits this week out, through to the next round */
const myBye = computed(
  () => !!thisRound.value && !!myParty.value && !!thisWeek.value && !thisWeek.value.matchups.some(m => isMine(m.home.partyId) || isMine(m.away?.partyId ?? ''))
)
/** The playoff final's winner, or without playoffs the best record */
const champion = computed(() => (league.value?.playoffs ? playoffs.value?.champion : standings.value[0]) ?? null)
const nextBattle = computed(() => {
  const value = league.value
  if (value?.status !== 'active' || !value.weekOneAt) return ''
  const at = value.nextResolvesAt ? new Date(value.nextResolvesAt) : nextBattleAt(value.weekOneAt, value.resolvedWeeks, value.cadence)
  return timeUntil(at)
})
const inviteLink = computed(() => (league.value?.pin ? `${window.location.origin}/join?pin=${league.value.pin}` : ''))

async function loadSeason() {
  if (!league.value || !inSeason.value) return
  const id = league.value.id
  if (coop.value || solo.value) {
    try {
      campaign.value = await api.getCampaign(id)
    } catch (caught) {
      error.value = caught
    }
    return
  }
  ;[standings.value, schedule.value, playoffs.value] = await Promise.all([
    api.getStandings(id),
    api.getSchedule(id),
    league.value.playoffs ? api.getPlayoffs(id) : null
  ])
}
onMounted(loadSeason)
watch(() => league.value?.status, loadSeason)

async function act(work: () => Promise<unknown>) {
  busy.value = true
  error.value = null
  try {
    await work()
    await reload()
  } catch (caught) {
    error.value = caught
  } finally {
    busy.value = false
  }
}

function scheduleDraft() {
  const id = league.value?.id
  if (!id) return
  void act(() => api.scheduleDraft(id, new Date(draftInput.value)))
}

function cancelLeague() {
  const id = league.value?.id
  if (!id || !window.confirm('Cancel this league for everyone? This cannot be undone.')) return
  void act(() => api.cancelLeague(id))
}

/** Finished and canceled leagues can be hidden from My leagues, for me only */
async function hideLeague() {
  const id = league.value?.id
  if (!id) return
  busy.value = true
  error.value = null
  try {
    await api.setLeagueHidden(id, true)
    await router.push('/leagues')
  } catch (caught) {
    error.value = caught
  } finally {
    busy.value = false
  }
}

/** Solo: before the party is confirmed the run is canceled; after, it ends as a loss */
function abandonRun() {
  const id = league.value?.id
  if (!id) return
  const message =
    league.value?.status === 'forming'
      ? 'Cancel this run? Nothing has been played, and you can start a new one.'
      : 'Abandon this run? It ends now as a loss, and can’t be resumed. You can start a new one.'
  if (!window.confirm(message)) return
  // The reload changes the status, which reloads the campaign with its outcome.
  void act(() => api.cancelLeague(id))
}

function removeParty(partyId: string, name: string) {
  const id = league.value?.id
  if (!id || !window.confirm(`Remove ${name} from the league?`)) return
  void act(() => api.removeParty(id, partyId))
}

async function leaveLeague() {
  const id = league.value?.id
  if (!id || !window.confirm('Leave this league? Your party will be removed.')) return
  busy.value = true
  try {
    await api.leaveLeague(id)
    await router.push('/leagues')
  } catch (caught) {
    error.value = caught
  } finally {
    busy.value = false
  }
}

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copied.value = true
  } catch {
    copied.value = false
  }
}

const isMine = (partyId: string) => partyId === myParty.value?.id

// Dynasty (docs/DYNASTY_SPEC.md): between seasons, after a season, and the way to the next one.
const dynasty = computed(() => league.value?.dynasty ?? null)
const offseason = computed(() => !!dynasty.value && dynasty.value.number > 1 && league.value?.status === 'forming')
const canStartNext = computed(
  () => isHost.value && league.value?.status === 'complete' && !!dynasty.value && dynasty.value.number < dynasty.value.seasons && !dynasty.value.nextLeagueId
)

async function startNextSeason() {
  if (!league.value) return
  busy.value = true
  error.value = null
  try {
    const next = await api.startNextSeason(league.value.id)
    await router.push(`/leagues/${next.id}`)
  } catch (caught) {
    error.value = caught
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <template v-if="league">
    <header class="page-header">
      <RouterLink to="/leagues" class="back-link">‹ Your leagues</RouterLink>
      <h1 class="title">{{ league.name }}</h1>
      <span v-if="league.mode === 'crossover'" class="mode-chip">Crossover</span>
      <span v-else-if="coop" class="mode-chip">Co-op</span>
      <span v-else-if="solo" class="mode-chip">Solo</span>
      <RouterLink v-if="dynasty" :to="`/leagues/${league.id}/dynasty`" class="mode-chip">Dynasty · season {{ dynasty.number }} of {{ dynasty.seasons }} ›</RouterLink>
      <div class="muted">
        <template v-if="league.status === 'forming' && solo">Building your party</template>
        <template v-else-if="league.status === 'forming'">Gathering parties · {{ league.partyCount }} of {{ league.maxParties }}</template>
        <template v-else-if="league.status === 'drafting'">Draft {{ league.draftAt ? timeUntil(new Date(league.draftAt)) : 'soon' }}</template>
        <template v-else-if="league.status === 'active'">
          Week {{ currentWeek }} of {{ seasonWeeks }} ·
          {{ league.mode === 'crossover' || solo ? 'follows the NFL schedule' : `battles resolve ${league.cadence}` }}
        </template>
        <template v-else-if="league.status === 'complete' && coop">Campaign {{ campaign?.outcome === 'lost' ? 'lost' : campaign?.outcome === 'won' ? 'won' : 'over' }}</template>
        <template v-else-if="league.status === 'complete' && solo">
          Run {{ campaign?.abandoned ? 'abandoned' : campaign?.outcome === 'won' ? 'won' : campaign?.outcome === 'lost' ? 'lost' : 'over' }}
        </template>
        <template v-else-if="solo">This run was canceled</template>
        <template v-else-if="league.status === 'complete'">Season complete</template>
        <template v-else>This league was canceled</template>
      </div>
    </header>

    <FormError :error="error" />

    <!-- Dynasty: between seasons, keepers and open parties; after a season, the next one -->
    <template v-if="offseason">
      <section class="card stack">
        <h2 class="section-title">The offseason</h2>
        <p class="muted small">Choose up to 3 heroes to keep from last season before the host schedules the draft. Keepers use your first picks.</p>
        <RouterLink :to="`/leagues/${league.id}/keepers`" class="btn btn-primary">Choose keepers</RouterLink>
      </section>
      <section v-if="league.openParties?.length" class="card stack">
        <h2 class="section-title">Open parties</h2>
        <p class="muted small">Their owners left. Anyone joining with the PIN can take one over, with its history and keepers.</p>
        <ul class="open-parties">
          <li v-for="open in league.openParties" :key="open.id">
            <CrestShield :crest="open.crest" :size="28" decorative />
            {{ open.name }}
          </li>
        </ul>
        <p v-if="isHost" class="muted small">Any still open when you schedule the draft leave the dynasty, and their keepers return to the pool.</p>
      </section>
    </template>
    <section v-if="canStartNext" class="card stack">
      <h2 class="section-title">Season {{ (dynasty?.number ?? 0) + 1 }} awaits</h2>
      <p class="muted small">Start the next season: every party carries over, and everyone chooses keepers before the draft.</p>
      <button type="button" class="btn btn-primary" :disabled="busy" @click="startNextSeason">Start season {{ (dynasty?.number ?? 0) + 1 }}</button>
    </section>
    <RouterLink v-if="dynasty?.nextLeagueId" :to="`/leagues/${dynasty.nextLeagueId}`" class="recap-link">Season {{ dynasty.number + 1 }} is open ›</RouterLink>
    <RouterLink v-if="dynasty?.previousLeagueId" :to="`/leagues/${dynasty.previousLeagueId}`" class="recap-link">‹ Season {{ dynasty.number - 1 }}</RouterLink>

    <!-- Solo, before the run: build the party -->
    <section v-if="solo && league.status === 'forming'" class="card stack">
      <h2 class="section-title">Build your party</h2>
      <p class="muted small">Sign heroes under the budget, choose who fights and your Champion, then confirm. Nothing is played until you do.</p>
      <RouterLink :to="`/leagues/${league.id}/solo`" class="btn btn-primary">Build your party</RouterLink>
    </section>
    <RouterLink v-if="solo && (league.status === 'complete' || league.status === 'canceled')" to="/solo/new" class="btn btn-secondary new-run">
      Start a new run
    </RouterLink>

    <!-- Forming: invite, parties, and getting to the draft -->
    <template v-if="league.status === 'forming' && !solo">
      <section v-if="league.pin" class="card invite">
        <div class="muted">Invite friends with this PIN</div>
        <div class="pin">{{ league.pin }}</div>
        <button type="button" class="btn btn-secondary small-btn" @click="copyInvite">{{ copied ? 'Invite link copied' : 'Copy invite link' }}</button>
      </section>

      <section v-if="isHost" class="card stack">
        <h2 class="section-title">Schedule the draft</h2>
        <p class="muted small">Scheduling locks the party list and builds the hero pool. Members rank heroes before it runs.</p>
        <div class="field">
          <label for="draft-at">Draft time</label>
          <input id="draft-at" v-model="draftInput" class="input" type="datetime-local" :min="draftMin" :max="draftMax" />
        </div>
        <button type="button" class="btn btn-primary" :disabled="busy || league.partyCount < 2" @click="scheduleDraft">Schedule draft</button>
        <p v-if="league.partyCount < 2" class="muted small">At least 2 parties are needed.</p>
      </section>
    </template>

    <!-- Drafting: countdown and rankings -->
    <template v-if="league.status === 'drafting'">
      <section class="card stack">
        <h2 class="section-title">The draft runs {{ league.draftAt ? timeUntil(new Date(league.draftAt)) : 'soon' }}</h2>
        <p class="muted small">On your turn, the draft takes your highest-ranked hero still available.</p>
        <RouterLink :to="`/leagues/${league.id}/heroes`" class="btn btn-primary">Rank your heroes</RouterLink>
      </section>
      <section v-if="isHost" class="card stack">
        <h2 class="section-title">Reschedule</h2>
        <div class="field">
          <label for="draft-at">New draft time</label>
          <input id="draft-at" v-model="draftInput" class="input" type="datetime-local" :min="draftMin" :max="draftMax" />
        </div>
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="scheduleDraft">Move the draft</button>
      </section>
    </template>

    <!-- Co-op and Solo in season: the campaign, with no standings or matchups -->
    <template v-if="inSeason && (coop || solo)">
      <RouterLink v-if="league.status === 'complete' && campaign" :to="`/leagues/${league.id}/finale`" class="finale-banner">
        <span class="finale-eyebrow">{{ solo ? 'Run' : 'Campaign' }} {{ campaign.abandoned ? 'abandoned' : campaign.outcome === 'won' ? 'won' : 'lost' }}</span>
        <span class="finale-name">
          <template v-if="campaign.outcome === 'won'">{{ solo ? 'Your party brought down the boss' : 'The league brought down the boss' }}</template>
          <template v-else>The monsters prevailed</template>
        </span>
        <span class="finale-cta">See the finale and awards ›</span>
      </RouterLink>
      <div v-if="league.status === 'active'" class="row-heading">
        <h2 class="section-title">The campaign</h2>
        <span v-if="nextBattle" class="muted small">{{ nextBattle }}</span>
      </div>
      <CampaignBoard v-if="campaign" :campaign="campaign" :league-id="league.id" :solo="solo" />
      <p v-if="solo && league.status === 'active'" class="muted small">
        Your Quest party fights each week. Set it and your Champion on the Party tab; sign and release heroes on the Market tab.
      </p>
      <p v-else-if="!solo" class="muted small">Every party fights the same monster. Your damage, and everyone else's, brings it down together.</p>
      <RouterLink v-if="league.draft" :to="`/leagues/${league.id}/draft`" class="recap-link">See the draft recap ›</RouterLink>
    </template>

    <!-- In season: standings and this week -->
    <template v-if="inSeason && !coop && !solo">
      <RouterLink v-if="league.status === 'complete'" :to="`/leagues/${league.id}/finale`" class="finale-banner">
        <span class="finale-eyebrow">Season complete</span>
        <span class="finale-name">{{ champion?.name ?? 'The champions' }} take the crown</span>
        <span class="finale-cta">See the finale and awards ›</span>
      </RouterLink>
      <h2 class="section-title spaced">Standings</h2>
      <table class="standings">
        <thead>
          <tr>
            <th scope="col">Party</th>
            <th scope="col" class="num">W–L</th>
            <th scope="col" class="num">Damage</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in standings"
            :key="row.partyId"
            :class="{ mine: isMine(row.partyId), cutoff: league.playoffs && index === league.playoffs.spots - 1 && index < standings.length - 1 }"
          >
            <th scope="row">
              <span class="rank">{{ index + 1 }}</span>
              <CrestShield :crest="row.crest" :size="22" />
              {{ row.name }}
              <span v-if="isMine(row.partyId)" class="you">you</span>
            </th>
            <td class="num">{{ row.wins }}–{{ row.losses }}<template v-if="row.draws">–{{ row.draws }}</template></td>
            <td class="num">{{ Math.round(row.totalDamage) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted small">
        Ties in the standings go to total damage.
        <template v-if="league.playoffs">The top {{ league.playoffs.spots }} make the playoffs; only regular-season battles count here.</template>
      </p>

      <template v-if="playoffs">
        <h2 class="section-title spaced">Playoffs</h2>
        <PlayoffBracket :playoffs="playoffs" :my-party-id="myParty?.id ?? null" />
      </template>

      <template v-if="thisWeek">
        <div class="row-heading">
          <h2 class="section-title">{{ thisRound ?? (league.status === 'complete' ? 'Final week' : "This week's battles") }}</h2>
          <span v-if="nextBattle" class="muted small">{{ nextBattle }}</span>
        </div>
        <ul class="battles">
          <li
            v-for="matchup in thisWeek.matchups"
            :key="matchup.home.partyId"
            class="card battle"
            :class="{ mine: isMine(matchup.home.partyId) || isMine(matchup.away?.partyId ?? ''), monster: !matchup.away }"
          >
            <span>{{ matchup.home.name }}</span>
            <span class="muted">vs</span>
            <span v-if="matchup.away">{{ matchup.away.name }}</span>
            <span v-else class="monster-name">{{ matchup.result?.monster ?? 'Dungeon monster' }}</span>
            <span v-if="matchup.kind === 'consolation'" class="muted small">Consolation</span>
          </li>
        </ul>
        <p v-if="thisWeek.matchups.some(m => !m.away)" class="muted small">
          The odd party out battles a monster as strong as the league average.
        </p>
        <p v-if="myBye" class="muted small">Your party rests on a bye this week, through to the next round.</p>
        <RouterLink v-else-if="league.status === 'active' && myParty" :to="`/leagues/${league.id}/matchup`" class="recap-link">
          See your matchup ›
        </RouterLink>
      </template>

      <RouterLink v-if="league.draft" :to="`/leagues/${league.id}/draft`" class="recap-link">See the draft recap ›</RouterLink>
    </template>

    <!-- Parties (before the season) -->
    <template v-if="(league.status === 'forming' || league.status === 'drafting') && !solo">
      <h2 class="section-title spaced">Parties</h2>
      <ul class="parties">
        <li v-for="party in league.parties" :key="party.id" class="card party">
          <CrestShield :crest="party.crest" :size="36" />
          <div class="party-text">
            <span class="party-name">{{ party.name }} <span v-if="party.isMine" class="you">you</span></span>
            <span class="muted small">{{ party.owner.displayName }}</span>
          </div>
          <button
            v-if="isHost && league.status === 'forming' && !party.isMine"
            type="button"
            class="link-button"
            :aria-label="`Remove ${party.name}`"
            @click="removeParty(party.id, party.name)"
          >
            Remove
          </button>
        </li>
      </ul>
    </template>

    <!-- Before the draft there are no tabs, so chat is linked here -->
    <RouterLink v-if="league.status === 'forming' && !solo" :to="`/leagues/${league.id}/chat`" class="recap-link">League chat ›</RouterLink>

    <div class="danger-zone">
      <button v-if="solo && ['forming', 'active'].includes(league.status)" type="button" class="link-button danger" :disabled="busy" @click="abandonRun">
        {{ league.status === 'forming' ? 'Cancel run' : 'Abandon run' }}
      </button>
      <button
        v-else-if="isHost && ['forming', 'drafting', 'active'].includes(league.status)"
        type="button"
        class="link-button danger"
        :disabled="busy"
        @click="cancelLeague"
      >
        Cancel league
      </button>
      <button v-if="league.status === 'complete' || league.status === 'canceled'" type="button" class="link-button" :disabled="busy" @click="hideLeague">
        Hide from my leagues
      </button>
      <button v-if="!isHost && league.status === 'forming'" type="button" class="link-button danger" :disabled="busy" @click="leaveLeague">
        Leave league
      </button>
    </div>
  </template>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.new-run {
  width: 100%;
  margin-top: 12px;
}
.small {
  font-size: 13px;
  margin: 0;
}
.stack {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.invite {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border-color: var(--line-strong);
}
.pin {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 36px;
  letter-spacing: 0.3em;
}
.small-btn {
  min-height: var(--tap);
  font-size: 15px;
}
.section-title {
  font-size: 22px;
}
.spaced {
  margin: 18px 0 8px;
}
.row-heading {
  margin: 18px 0 8px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.standings {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
}
.standings thead th {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  text-align: left;
  padding: 6px 0;
}
.standings tbody tr {
  border-top: 1px solid var(--line);
}
.standings tbody th {
  text-align: left;
  font-weight: 500;
  padding: 10px 6px;
}
.standings tbody th :deep(svg) {
  vertical-align: middle;
  margin-right: 4px;
}
.standings tr.mine {
  background: var(--surface-raised);
}
/* The playoff line: the last party in the bracket */
.standings tr.cutoff {
  border-bottom: 2px dashed var(--gold);
}
.standings tr.mine th {
  font-weight: 700;
}
.rank {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--text-muted);
  margin-right: 8px;
}
tr.mine .rank {
  color: var(--gold);
}
.num {
  text-align: right;
  padding-right: 6px;
}
.you {
  font-size: 12px;
  color: var(--gold);
}
.battles,
.parties {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.battle {
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.battle.mine {
  border-color: var(--line-strong);
  font-weight: 700;
}
.battle.monster {
  border-style: dashed;
  border-color: var(--gold);
}
.monster-name {
  color: var(--gold);
  font-weight: 700;
}
.recap-link {
  display: inline-block;
  margin-top: 16px;
  font-weight: 700;
}
.party {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}
.party-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.party-name {
  font-weight: 700;
}
.link-button {
  min-height: var(--tap);
  border: 0;
  background: transparent;
  color: var(--gold);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.danger {
  color: var(--danger);
}
.danger-zone {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}
.finale-banner {
  margin-top: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--gold);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--gold) 18%, transparent), transparent 70%),
    var(--surface);
  color: var(--text);
  text-align: center;
  text-decoration: none;
}
.finale-eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gold);
}
.finale-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
}
.finale-cta {
  font-size: 14px;
  color: var(--gold);
}
.mode-chip {
  align-self: flex-start;
  padding: 1px 10px;
  border: 1px solid var(--gold);
  border-radius: 999px;
  color: var(--gold);
  font-size: 13px;
  font-weight: 700;
}
.open-parties {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.open-parties li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}
a.mode-chip {
  text-decoration: none;
}
</style>
