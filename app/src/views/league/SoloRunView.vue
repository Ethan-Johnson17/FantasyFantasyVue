<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../../api/inject'
import type { SoloHero, SoloRun } from '../../api/types'
import ClassIcon from '../../components/ClassIcon.vue'
import FormError from '../../components/FormError.vue'
import PlayerTag from '../../components/PlayerTag.vue'
import SoloPool from '../../components/SoloPool.vue'
import { CLASS_COLOR, levelText } from '../../heroes'
import { useLeague } from '../../league'
import { goldText, pickProblem, swapGold, swapProblem, windowsText } from '../../solo'

/*
 * A Solo run's market (docs/SOLO_SPEC.md). Before the run: build the party of 8 under the cap, choose the Quest party
 * of 5 and a Champion, see the monsters ahead, and confirm. Once it's under way: swaps, releasing one hero and
 * signing another, up to the week's limit.
 */

const api = useApi()
const router = useRouter()
const { league, reload } = useLeague()

const run = ref<SoloRun | null>(null)
const error = ref<unknown>(null)
const busy = ref(false)
const notice = ref('')

onMounted(async () => {
  if (!league.value) return
  try {
    run.value = await api.getSolo(league.value.id)
  } catch (caught) {
    error.value = caught
  }
})

const heroById = computed(() => new Map((run.value?.pool ?? []).map(hero => [hero.id, hero])))
const building = computed(() => run.value?.status === 'forming')

// --- Building the party ---------------------------------------------------------------------------------------------
const picked = ref<string[]>([])
const quest = ref<string[]>([])
const champion = ref<string | null>(null)
const picks = computed(() => picked.value.flatMap(id => heroById.value.get(id) ?? []))
const spentNow = computed(() => picks.value.reduce((sum, hero) => sum + hero.cost, 0))
const goldLeft = computed(() => (run.value?.cap ?? 0) - spentNow.value)
const pickedProblem = (hero: SoloHero) => (run.value ? pickProblem(run.value, picks.value, hero) : null)
const available = computed(() => (run.value?.pool ?? []).filter(hero => !picked.value.includes(hero.id)))

function pick(hero: SoloHero) {
  if (!run.value || pickedProblem(hero)) return
  picked.value = [...picked.value, hero.id]
  // The first heroes signed fight; later ones start on the bench.
  if (quest.value.length < run.value.partySize) quest.value = [...quest.value, hero.id]
  notice.value = ''
}
function unpick(hero: SoloHero) {
  picked.value = picked.value.filter(id => id !== hero.id)
  quest.value = quest.value.filter(id => id !== hero.id)
  if (champion.value === hero.id) champion.value = null
}
function toggleQuest(hero: SoloHero) {
  if (!run.value) return
  if (quest.value.includes(hero.id)) {
    quest.value = quest.value.filter(id => id !== hero.id)
    if (champion.value === hero.id) champion.value = null
  } else if (quest.value.length < run.value.partySize) {
    quest.value = [...quest.value, hero.id]
  }
}
function toggleChampion(hero: SoloHero) {
  if (!quest.value.includes(hero.id)) return
  champion.value = champion.value === hero.id ? null : hero.id
}

/** What still stands between the party and confirming it */
const confirmProblem = computed(() => {
  const value = run.value
  if (!value) return 'Loading…'
  if (value.startProblem) return value.startProblem
  if (picks.value.length !== value.rosterSize) return `Pick ${String(value.rosterSize - picks.value.length)} more of your ${String(value.rosterSize)} heroes`
  if (quest.value.length !== value.partySize) return `Choose ${String(value.partySize)} heroes for your Quest party`
  if (spentNow.value > value.cap) return `Your party costs ${goldText(spentNow.value)}; the cap is ${goldText(value.cap)}`
  return null
})

async function confirm() {
  const id = league.value?.id
  const value = run.value
  if (!id || !value || confirmProblem.value) return
  const start = value.start ? ` It starts with NFL week ${String(value.start.firstWeek)}.` : ''
  const noChampion = champion.value ? '' : ' You haven’t named a Champion, so your party fights without one until you do.'
  const message = `Confirm your party?${start} After this, changes are swaps: ${String(value.swapsPerWeek)} a week.${noChampion}`
  if (!window.confirm(message)) return
  busy.value = true
  error.value = null
  try {
    run.value = await api.confirmSolo(id, { heroIds: picked.value, questParty: quest.value, champion: champion.value })
    await reload()
    await router.push(`/leagues/${id}/quest`)
  } catch (caught) {
    error.value = caught
  } finally {
    busy.value = false
  }
}

/** Before the party is confirmed nothing has been played: canceling ends the run, and a new one can start */
async function cancelRun() {
  const id = league.value?.id
  if (!id || !window.confirm('Cancel this run? Nothing has been played, and you can start a new one.')) return
  busy.value = true
  error.value = null
  try {
    await api.cancelLeague(id)
    await router.push('/leagues')
  } catch (caught) {
    error.value = caught
  } finally {
    busy.value = false
  }
}

// --- Swaps, once the run is under way -------------------------------------------------------------------------------
// Up to the week's swaps left can be made together: choose who leaves, then who joins, in the same order. The gold
// from every release counts toward every signing, so an upgrade can be paid for by a cheaper replacement elsewhere.
const party = computed(() => (run.value?.pool ?? []).filter(hero => hero.partyId !== null))
const releasing = ref<string[]>([])
const signing = ref<string[]>([])
const heroesOf = (ids: readonly string[]) => ids.flatMap(id => heroById.value.get(id) ?? [])
const releaseHeroes = computed(() => heroesOf(releasing.value))
const signHeroes = computed(() => heroesOf(signing.value))
const freeAgents = computed(() => (run.value?.pool ?? []).filter(hero => hero.partyId === null && !signing.value.includes(hero.id)))
const swapsLeft = computed(() => (run.value?.status === 'active' ? (run.value.swapsLeft ?? 0) : 0))
const canSwap = computed(() => swapsLeft.value > 0)
const goldToSpend = computed(() => (run.value ? swapGold(run.value, releaseHeroes.value, signHeroes.value) : 0))

function toggleRelease(hero: SoloHero) {
  const index = releasing.value.indexOf(hero.id)
  if (index >= 0) {
    releasing.value = releasing.value.filter(id => id !== hero.id)
    // A signing pairs with the release in the same place, so the ones past the releases left go too.
    signing.value = signing.value.slice(0, releasing.value.length)
  } else if (releasing.value.length < swapsLeft.value) {
    releasing.value = [...releasing.value, hero.id]
  }
}
const releaseDisabled = (hero: SoloHero) =>
  !canSwap.value || hero.locked || busy.value || (!releasing.value.includes(hero.id) && releasing.value.length >= swapsLeft.value)

const signProblem = (hero: SoloHero) => {
  if (!run.value) return 'Loading…'
  if (releasing.value.length === 0) return 'Choose a hero to release first'
  return swapProblem(run.value, releaseHeroes.value, signHeroes.value, hero)
}
const unsign = (hero: SoloHero) => {
  signing.value = signing.value.filter(id => id !== hero.id)
}

/** "A and B", or just "A" */
const both = (names: readonly string[]) => names.join(' and ')

async function sign(hero: SoloHero) {
  const id = league.value?.id
  if (!id || signProblem(hero)) return
  signing.value = [...signing.value, hero.id]
  // Make the swaps once every release has someone to take its place.
  if (signing.value.length < releasing.value.length) return
  const releases = releaseHeroes.value
  const signings = signHeroes.value
  const pairs = releases.map((release, index) => ({ release, sign: signings[index] }))
  const lines = pairs.map(({ release, sign: joining }) => `${joining?.name ?? ''} (${goldText(joining?.cost ?? 0)}) for ${release.name}`)
  const swaps = pairs.length === 1 ? 'one of this week’s swaps' : `${String(pairs.length)} of this week’s swaps`
  if (!window.confirm(`Sign ${lines.join(' and ')}? This uses ${swaps}.`)) {
    signing.value = signing.value.slice(0, -1)
    return
  }
  busy.value = true
  error.value = null
  notice.value = ''
  try {
    run.value = await api.swapSolo(id, { swaps: pairs.map(({ release, sign: joining }) => ({ releaseHeroId: release.id, signHeroId: joining?.id ?? '' })) })
    releasing.value = []
    signing.value = []
    const places = releases.length === 1 ? `${releases[0]?.name ?? ''}’s place` : `${both(releases.map(release => `${release.name}’s`))} places`
    notice.value = `${both(signings.map(joining => joining.name))} joined your party, taking ${places}.`
    // Releasing the Champion leaves the party without one.
    const lineup = await api.getLineup(id).catch(() => null)
    if (lineup && !lineup.champion) notice.value += ' Your party has no Champion: name one on the Party tab.'
  } catch (caught) {
    error.value = caught
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <header class="page-header">
    <!-- While the party is being built there are no tabs, so the way back is here -->
    <RouterLink v-if="building" to="/leagues" class="back-link">‹ Your leagues</RouterLink>
    <div v-else class="eyebrow">{{ league?.name }}</div>
    <h1 class="title">{{ building ? 'Build your party' : 'The market' }}</h1>
  </header>

  <FormError :error="error" />
  <p v-if="!run && !error" class="muted" aria-busy="true">Loading the pool…</p>

  <template v-if="run && building">
    <section class="card budget" aria-live="polite">
      <div class="budget-top">
        <span><strong>{{ goldText(goldLeft) }}</strong> <span class="muted small">left of {{ run.cap }}</span></span>
        <span class="muted small">{{ picks.length }} of {{ run.rosterSize }} heroes</span>
      </div>
      <div class="bar" role="progressbar" aria-label="Gold spent" :aria-valuenow="spentNow" aria-valuemin="0" :aria-valuemax="run.cap">
        <div class="bar-fill" :style="{ width: `${Math.min(100, (spentNow / Math.max(1, run.cap)) * 100)}%` }"></div>
      </div>
      <p class="muted small">
        A hero costs their Level squared: Level 1 is {{ run.costs[0] }} gold, Level 10 is {{ run.costs.at(-1) }}. The price is locked when you
        sign them. At most {{ run.paladinLimit }} Paladins (team defenses).
      </p>
    </section>

    <p v-if="run.startProblem" class="card warning" role="alert">{{ run.startProblem }}</p>
    <p v-else-if="run.start" class="muted small">
      Confirm now and your run starts with NFL week {{ run.start.firstWeek }}: {{ run.start.weeks }} weeks through week 17. The monsters get
      {{ windowsText(run.start.windows) }}.
      <template v-if="run.poolWeek">Levels reflect NFL week {{ run.poolWeek }}.</template>
    </p>

    <h2 class="section-title spaced">The monsters ahead</h2>
    <ol class="monsters">
      <li v-for="(monster, index) in run.monsters" :key="monster.name" class="monster">
        <span class="monster-name">
          <span class="muted small">{{ monster.boss ? 'Boss raid' : `Chapter ${index + 1}` }}<template v-if="run.start"> · {{ run.start.windows[index] }} wk</template></span>
          {{ monster.name }}
        </span>
        <span class="small">
          Weak to
          <template v-for="(heroClass, weakIndex) in monster.weak" :key="heroClass">
            <strong :style="{ color: CLASS_COLOR[heroClass] }">{{ heroClass }}s</strong>{{ weakIndex === 0 ? ' and ' : '' }}
          </template>
          · resists <strong :style="{ color: CLASS_COLOR[monster.resists] }">{{ monster.resists }}s</strong>
        </span>
      </li>
    </ol>

    <h2 class="section-title spaced">Your party</h2>
    <p class="muted small">
      {{ run.partySize }} heroes fight in the Quest party; the rest wait on the bench to cover byes. Tap ♛ to name a Champion from the Quest party.
    </p>
    <p v-if="!picks.length" class="card muted">Sign heroes from the pool below.</p>
    <ul class="list">
      <li v-for="hero in picks" :key="hero.id" class="pick" :class="{ fighting: quest.includes(hero.id), champion: champion === hero.id }">
        <ClassIcon :hero-class="hero.heroClass" :size="26" />
        <span class="text">
          <span class="name">{{ hero.name }}</span>
          <PlayerTag :hero="hero" />
          <span class="muted small">{{ levelText(hero) }} · {{ goldText(hero.cost) }} · {{ quest.includes(hero.id) ? 'Quest party' : 'Bench' }}</span>
        </span>
        <button
          type="button"
          class="crown"
          :class="{ active: champion === hero.id }"
          :aria-pressed="champion === hero.id"
          :aria-label="champion === hero.id ? `Withdraw ${hero.name} as Champion` : `Name ${hero.name} Champion`"
          :disabled="!quest.includes(hero.id)"
          @click="toggleChampion(hero)"
        >
          ♛
        </button>
        <button
          type="button"
          class="btn btn-secondary mini"
          :aria-pressed="quest.includes(hero.id)"
          :aria-label="quest.includes(hero.id) ? `Move ${hero.name} to the bench` : `Move ${hero.name} to the Quest party`"
          :disabled="!quest.includes(hero.id) && quest.length >= run.partySize"
          @click="toggleQuest(hero)"
        >
          {{ quest.includes(hero.id) ? 'Bench' : 'Fight' }}
        </button>
        <button type="button" class="btn btn-secondary mini" :aria-label="`Remove ${hero.name}`" @click="unpick(hero)">✕</button>
      </li>
    </ul>

    <div class="confirm">
      <p v-if="confirmProblem" class="muted small" role="status">{{ confirmProblem }}</p>
      <p v-else-if="!champion" class="muted small" role="status">Name a Champion: runs with one win far more often.</p>
      <button type="button" class="btn btn-primary" :disabled="busy || !!confirmProblem" @click="confirm">
        {{ busy ? 'Confirming…' : 'Confirm party and start' }}
      </button>
    </div>

    <h2 class="section-title spaced">The pool</h2>
    <SoloPool :heroes="available" action-label="Sign" :problem="pickedProblem" :disabled="busy" @choose="pick" />

    <div class="danger-zone">
      <button type="button" class="link-button danger" :disabled="busy" @click="cancelRun">Cancel run</button>
    </div>
  </template>

  <template v-else-if="run">
    <section class="card budget">
      <div class="budget-top">
        <span><strong>{{ run.swapsLeft ?? 0 }}</strong> <span class="muted small">of {{ run.swapsPerWeek }} swaps left this week</span></span>
        <span class="muted small">{{ goldText(run.cap - run.spent) }} to spend</span>
      </div>
      <p class="muted small">
        A swap releases one hero and signs another at today's price. Make two together and the gold from both releases counts toward
        both signings. Swaps reset when the week goes final; a hero whose game has kicked off can't be released or signed.
      </p>
    </section>
    <p v-if="run.status !== 'active'" class="card muted">This run is over. <RouterLink :to="`/leagues/${league?.id}/finale`">See the finale ›</RouterLink></p>
    <p v-if="notice" class="muted" role="status">{{ notice }}</p>

    <template v-if="run.status === 'active'">
      <h2 class="section-title spaced">1. Release a hero</h2>
      <ul class="list">
        <li v-for="hero in party" :key="hero.id">
          <button
            type="button"
            class="pick release"
            :class="{ selected: releasing.includes(hero.id), locked: hero.locked }"
            :aria-pressed="releasing.includes(hero.id)"
            :disabled="releaseDisabled(hero)"
            @click="toggleRelease(hero)"
          >
            <ClassIcon :hero-class="hero.heroClass" :size="26" />
            <span class="text">
              <span class="name">{{ hero.name }}</span>
              <PlayerTag :hero="hero" />
              <span class="muted small">
                {{ levelText(hero) }} · paid {{ goldText(hero.price ?? 0) }}<template v-if="hero.locked"> · 🔒 kicked off</template>
              </span>
            </span>
            <span v-if="releasing.includes(hero.id)" class="tag">Releasing</span>
          </button>
        </li>
      </ul>

      <h2 class="section-title spaced">2. Sign a replacement</h2>
      <p v-if="!canSwap" class="muted small">No swaps left this week. They reset when the week goes final.</p>
      <p v-else-if="releasing.length === 0" class="muted small">
        Choose a hero to release first<template v-if="swapsLeft > 1">, or two to pool their gold for an upgrade</template>.
      </p>
      <section v-else class="card swap-summary" aria-label="This swap">
        <p class="muted small">
          {{ goldText(goldToSpend) }} to spend ·
          {{ signing.length }} of {{ releasing.length }} {{ releasing.length === 1 ? 'replacement' : 'replacements' }} chosen
        </p>
        <ul class="pairs">
          <li v-for="(release, index) in releaseHeroes" :key="release.id">
            <template v-if="signHeroes[index]">
              <strong>{{ signHeroes[index].name }}</strong> for {{ release.name }}
              <button type="button" class="link-button small" :disabled="busy" @click="unsign(signHeroes[index])">Undo</button>
            </template>
            <span v-else class="muted">Sign someone for {{ release.name }}</span>
          </li>
        </ul>
      </section>
      <SoloPool :heroes="freeAgents" action-label="Sign" :problem="signProblem" :disabled="busy || releasing.length === 0" @choose="sign" />
    </template>
  </template>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.small {
  font-size: 13px;
}
.spaced {
  margin-top: 22px;
}
.swap-summary {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.swap-summary p {
  margin: 0;
}
.pairs {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.budget {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.budget p {
  margin: 0;
}
.budget-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.budget-top strong {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--gold);
}
.bar {
  height: 8px;
  border-radius: 4px;
  background: var(--surface-sunken);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: var(--gold);
}
.warning {
  border-color: var(--danger);
}
.monsters,
.list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.monster {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.monster-name {
  display: flex;
  flex-direction: column;
  font-weight: 700;
}
.pick {
  width: 100%;
  min-height: var(--tap);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  text-align: left;
}
.pick.fighting {
  border-color: var(--line-strong);
}
.pick.champion {
  border-color: var(--gold);
  box-shadow: inset 3px 0 0 var(--gold);
}
.release {
  cursor: pointer;
}
.release:disabled {
  cursor: default;
}
.release.selected {
  border: 2px solid var(--gold);
  background: color-mix(in srgb, var(--gold) 16%, var(--surface));
}
.pick.locked {
  opacity: 0.75;
}
.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.name {
  font-weight: 700;
}
.crown {
  flex: none;
  width: 40px;
  min-height: 40px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
}
.crown.active {
  border-color: var(--gold);
  color: var(--gold);
}
.crown:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.mini {
  flex: none;
  min-height: 40px;
  padding: 0 10px;
}
.tag {
  flex: none;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--gold);
  color: var(--on-gold);
  font-size: 12px;
  font-weight: 700;
}
.confirm {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.confirm .btn {
  width: 100%;
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
</style>
