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
import { goldText, pickProblem, swapProblem, windowsText } from '../../solo'

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

// --- Swaps, once the run is under way -------------------------------------------------------------------------------
const party = computed(() => (run.value?.pool ?? []).filter(hero => hero.partyId !== null))
const freeAgents = computed(() => (run.value?.pool ?? []).filter(hero => hero.partyId === null))
const releasing = ref<string | null>(null)
const releaseHero = computed(() => heroById.value.get(releasing.value ?? '') ?? null)
const canSwap = computed(() => !!run.value && run.value.status === 'active' && (run.value.swapsLeft ?? 0) > 0)
const signProblem = (hero: SoloHero) => {
  if (!run.value) return 'Loading…'
  if (!releaseHero.value) return 'Choose a hero to release first'
  return swapProblem(run.value, releaseHero.value, hero)
}

async function sign(hero: SoloHero) {
  const id = league.value?.id
  const release = releaseHero.value
  if (!id || !release || signProblem(hero)) return
  if (!window.confirm(`Release ${release.name} and sign ${hero.name} for ${goldText(hero.cost)}? This uses one of this week’s swaps.`)) return
  busy.value = true
  error.value = null
  notice.value = ''
  try {
    run.value = await api.swapSolo(id, { releaseHeroId: release.id, signHeroId: hero.id })
    releasing.value = null
    notice.value = `${hero.name} joined your party, taking ${release.name}’s place.`
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
    <div class="eyebrow">{{ league?.name }}</div>
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
  </template>

  <template v-else-if="run">
    <section class="card budget">
      <div class="budget-top">
        <span><strong>{{ run.swapsLeft ?? 0 }}</strong> <span class="muted small">of {{ run.swapsPerWeek }} swaps left this week</span></span>
        <span class="muted small">{{ goldText(run.cap - run.spent) }} to spend</span>
      </div>
      <p class="muted small">
        A swap releases one hero and signs another at today's price. Swaps reset when the week goes final; a hero whose game has kicked
        off can't be released or signed.
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
            :class="{ selected: releasing === hero.id, locked: hero.locked }"
            :aria-pressed="releasing === hero.id"
            :disabled="!canSwap || hero.locked || busy"
            @click="releasing = releasing === hero.id ? null : hero.id"
          >
            <ClassIcon :hero-class="hero.heroClass" :size="26" />
            <span class="text">
              <span class="name">{{ hero.name }}</span>
              <PlayerTag :hero="hero" />
              <span class="muted small">
                {{ levelText(hero) }} · paid {{ goldText(hero.price ?? 0) }}<template v-if="hero.locked"> · 🔒 kicked off</template>
              </span>
            </span>
            <span v-if="releasing === hero.id" class="tag">Releasing</span>
          </button>
        </li>
      </ul>

      <h2 class="section-title spaced">2. Sign a replacement</h2>
      <p v-if="!canSwap" class="muted small">No swaps left this week. They reset when the week goes final.</p>
      <p v-else-if="!releaseHero" class="muted small">Choose a hero to release first.</p>
      <SoloPool :heroes="freeAgents" action-label="Sign" :problem="signProblem" :disabled="busy || !releaseHero" @choose="sign" />
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
</style>
