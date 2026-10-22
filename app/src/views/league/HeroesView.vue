<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApi } from '../../api/inject'
import type { Hero, HeroClass, Lineup, RosterMove } from '../../api/types'
import ClaimPanel from '../../components/ClaimPanel.vue'
import ClassIcon from '../../components/ClassIcon.vue'
import FormError from '../../components/FormError.vue'
import TraitChips from '../../components/TraitChips.vue'
import { CLASS_COLOR, HERO_CLASSES, isMystery, levelText, levelValue } from '../../heroes'
import { useLeague } from '../../league'
import { timeUntil } from '../../time'

const api = useApi()
const { league, myParty } = useLeague()

const heroes = ref<Hero[]>([])
const ranking = ref<string[]>([])
const savedRanking = ref<string[]>([])
const filter = ref<HeroClass | 'All'>('All')
const saving = ref(false)
const notice = ref('')
const error = ref<unknown>(null)

const drafting = computed(() => league.value?.status === 'drafting')
const canClaim = computed(() => league.value?.status === 'active' && !!myParty.value)

const moves = ref<RosterMove[]>([])
/** The free agent being claimed, with my lineup for choosing whom to drop. */
const claiming = ref<{ target: Hero; lineup: Lineup } | null>(null)
const claimError = ref<unknown>(null)
const claimBusy = ref(false)

onMounted(async () => {
  if (!league.value || league.value.status === 'forming') return
  try {
    heroes.value = await api.listHeroes(league.value.id)
    if (drafting.value) {
      const saved = await api.getRankings(league.value.id)
      ranking.value = [...saved.heroIds]
      savedRanking.value = [...saved.heroIds]
    } else {
      moves.value = await api.listMoves(league.value.id)
    }
  } catch (caught) {
    error.value = caught
  }
})

const byId = computed(() => new Map(heroes.value.map(hero => [hero.id, hero])))
const matches = (hero: Hero) => filter.value === 'All' || hero.heroClass === filter.value
const ranked = computed(() =>
  ranking.value.flatMap((id, index) => {
    const hero = byId.value.get(id)
    return hero && matches(hero) ? [{ hero, rank: index + 1 }] : []
  })
)
const unranked = computed(() =>
  heroes.value
    .filter(hero => !ranking.value.includes(hero.id) && matches(hero))
    .sort((a, b) => levelValue(b) - levelValue(a) || a.name.localeCompare(b.name))
)
const changed = computed(() => JSON.stringify(ranking.value) !== JSON.stringify(savedRanking.value))
const partyName = (partyId: string | null) => league.value?.parties.find(party => party.id === partyId)?.name ?? 'Free agent'
const battlesPlayed = computed(() => (league.value?.resolvedWeeks ?? 0) > 0)
/** Free agents and drafted heroes sort by Level, or by recent form once battles have been played. */
const sortBy = ref<'level' | 'form'>('form')
const bySort = (a: Hero, b: Hero) =>
  (sortBy.value === 'form' && battlesPlayed.value ? (b.form?.recent ?? -Infinity) - (a.form?.recent ?? -Infinity) : 0) ||
  levelValue(b) - levelValue(a) ||
  a.name.localeCompare(b.name)
const freeAgents = computed(() => heroes.value.filter(hero => hero.partyId === null && matches(hero)).sort(bySort))
const drafted = computed(() => heroes.value.filter(hero => hero.partyId !== null && matches(hero)).sort(bySort))

/** "Last 3: 22 · season 18" ("Avg 47 · 1 battle" early on), or why there's nothing to show yet. */
function formText(hero: Hero): string {
  const form = hero.form
  if (!form || !battlesPlayed.value) return ''
  if (!form.played) return 'No battles fought yet'
  // Until there are more than three battles, recent form and the season average are the same.
  const playing = form.playingLike ? `Playing like Lv ${String(form.playingLike)} · ` : ''
  if (form.played <= 3) return `${playing}Avg ${String(form.average ?? 0)} · ${String(form.played)} battle${form.played === 1 ? '' : 's'}`
  return `${playing}Last 3: ${String(form.recent ?? 0)} · season ${String(form.average ?? 0)}`
}

/** Ranks every unranked hero in view, best Level first, after the ones already ranked. */
function rankAll() {
  ranking.value = [...ranking.value, ...unranked.value.map(hero => hero.id)]
  notice.value = ''
}

function clearRanking() {
  const scope = filter.value === 'All' ? 'your whole ranking' : `every ${filter.value} in your ranking`
  if (!window.confirm(`Clear ${scope}? Nothing changes until you save.`)) return
  ranking.value = filter.value === 'All' ? [] : ranking.value.filter(id => byId.value.get(id)?.heroClass !== filter.value)
}

async function openClaim(target: Hero) {
  if (!league.value) return
  claimError.value = null
  try {
    claiming.value = { target, lineup: await api.getLineup(league.value.id) }
  } catch (caught) {
    error.value = caught
  }
}

async function confirmClaim(dropHeroId: string) {
  if (!league.value || !claiming.value) return
  const { target } = claiming.value
  claimBusy.value = true
  claimError.value = null
  try {
    await api.claimHero(league.value.id, target.id, dropHeroId)
    claiming.value = null
    flash(`${target.name} joined your party.`)
  } catch (caught) {
    claimError.value = caught
  } finally {
    claimBusy.value = false
  }
  // Refresh either way: on a lost race the hero now belongs to someone else.
  try {
    const [freshHeroes, freshMoves] = await Promise.all([api.listHeroes(league.value.id), api.listMoves(league.value.id)])
    heroes.value = freshHeroes
    moves.value = freshMoves
  } catch (caught) {
    error.value = caught
  }
}

function move(id: string, delta: number) {
  const list = [...ranking.value]
  const from = list.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= list.length) return
  list.splice(to, 0, ...list.splice(from, 1))
  ranking.value = list
  notice.value = ''
}
function add(id: string) {
  ranking.value = [...ranking.value, id]
  notice.value = ''
}
function remove(id: string) {
  ranking.value = ranking.value.filter(entry => entry !== id)
  notice.value = ''
}

/** Shows a short confirmation in the save pill's place, then clears it. */
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function flash(text: string) {
  notice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (notice.value = ''), 2500)
}
onBeforeUnmount(() => {
  clearTimeout(noticeTimer)
})

async function save() {
  if (!league.value) return
  saving.value = true
  error.value = null
  try {
    const saved = await api.setRankings(league.value.id, ranking.value)
    savedRanking.value = [...saved.heroIds]
    flash('Ranking saved.')
  } catch (caught) {
    error.value = caught
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <header class="page-header">
    <div class="eyebrow">{{ league?.name }}</div>
    <h1 class="title">{{ drafting ? 'Rank your heroes' : 'Heroes' }}</h1>
    <div v-if="drafting && league?.draftAt" class="muted">
      Draft {{ timeUntil(new Date(league.draftAt)) }} · {{ ranking.length }} of {{ heroes.length }} ranked
    </div>
  </header>

  <p v-if="league?.status === 'forming'" class="card muted">The hero pool appears once the host schedules the draft.</p>
  <FormError :error="error" />

  <template v-if="heroes.length">
    <div class="filters" role="group" aria-label="Filter by class">
      <button type="button" class="chip" :aria-pressed="filter === 'All'" @click="filter = 'All'">All</button>
      <button
        v-for="heroClass in HERO_CLASSES"
        :key="heroClass"
        type="button"
        class="chip"
        :aria-pressed="filter === heroClass"
        :style="{ color: filter === heroClass ? undefined : CLASS_COLOR[heroClass] }"
        @click="filter = heroClass"
      >
        {{ heroClass }}
      </button>
    </div>

    <!-- Before the draft: rank the pool -->
    <template v-if="drafting">
      <p class="note">
        On your turn, the draft takes your highest-ranked hero still available. If none are left, it picks the best Level for you.
        A party can hold at most 2 Paladins, so extra Paladins you rank are skipped.
      </p>
      <p class="muted small traits-help">
        Look past Level: a Steadfast and a Wild hero fighting together deal bonus damage, Mighty heroes make the
        strongest Champions, and a Wild Champion guarded by a Steadfast ally never has a truly bad battle.
        <RouterLink to="/how-it-works#traits">How traits work ›</RouterLink>
      </p>

      <div class="row-heading">
        <h2 class="section-title">Your ranking</h2>
        <button v-if="ranked.length" type="button" class="link-button" @click="clearRanking">Clear{{ filter === 'All' ? '' : ` ${filter}s` }}</button>
      </div>
      <p v-if="ranked.length === 0" class="muted small">Nothing ranked{{ filter === 'All' ? ' yet' : ` in ${filter}` }}. Add heroes from the pool below.</p>
      <ol class="list">
        <li v-for="{ hero, rank } in ranked" :key="hero.id" class="row" :class="{ mystery: isMystery(hero) }">
          <span class="rank">{{ rank }}</span>
          <RouterLink :to="`/leagues/${league?.id}/heroes/${hero.id}`" class="hero-text">
            <span class="hero-name">{{ hero.name }}</span>
            <span class="small" :style="{ color: CLASS_COLOR[hero.heroClass] }">
              {{ hero.race }} {{ hero.heroClass }}{{ isMystery(hero) ? ' · mystery recruit' : '' }}
            </span>
            <TraitChips :traits="hero.traits" />
          </RouterLink>
          <span class="level">{{ levelText(hero) }}</span>
          <span class="controls">
            <button type="button" class="icon-button" :aria-label="`Move ${hero.name} up`" @click="move(hero.id, -1)">▲</button>
            <button type="button" class="icon-button" :aria-label="`Move ${hero.name} down`" @click="move(hero.id, 1)">▼</button>
            <button type="button" class="icon-button" :aria-label="`Remove ${hero.name} from your ranking`" @click="remove(hero.id)">✕</button>
          </span>
        </li>
      </ol>

      <div class="row-heading">
        <h2 class="section-title">Pool</h2>
        <button v-if="unranked.length" type="button" class="btn btn-secondary rank-all" @click="rankAll">
          Rank all {{ filter === 'All' ? unranked.length : `${unranked.length} ${filter}${unranked.length === 1 ? '' : 's'}` }} by Level
        </button>
      </div>
      <p v-if="unranked.length" class="muted small">Start from Level, then move heroes up for the traits you want.</p>
      <ul class="list">
        <li v-for="hero in unranked" :key="hero.id" class="row" :class="{ mystery: isMystery(hero) }">
          <ClassIcon :hero-class="hero.heroClass" :size="36" />
          <RouterLink :to="`/leagues/${league?.id}/heroes/${hero.id}`" class="hero-text">
            <span class="hero-name">{{ hero.name }}</span>
            <span class="muted small">{{ hero.race }} {{ hero.heroClass }}{{ isMystery(hero) ? ' · mystery recruit' : '' }}</span>
            <TraitChips :traits="hero.traits" />
          </RouterLink>
          <span class="level">{{ levelText(hero) }}</span>
          <button type="button" class="add-button" :aria-label="`Rank ${hero.name}`" @click="add(hero.id)">Rank</button>
        </li>
      </ul>

      <!-- Only while there is something to save (or just saved), so it never covers the list for nothing. -->
      <div class="save-bar" role="status">
        <button v-if="changed || saving" type="button" class="btn btn-primary save-button" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save ranking' }}
        </button>
        <span v-else-if="notice" class="saved-pill">✓ {{ notice }}</span>
      </div>
    </template>

    <!-- After the draft: free agents to claim, then who's where -->
    <template v-else>
      <h2 class="section-title">Free agents</h2>
      <p v-if="canClaim" class="muted small">
        Claim a free agent by dropping one of your heroes. First come, first served; the change counts from the next battle.
      </p>
      <div v-if="battlesPlayed" class="sort" role="group" aria-label="Sort heroes">
        <span class="muted small">Sort by</span>
        <button type="button" class="chip" :aria-pressed="sortBy === 'form'" @click="sortBy = 'form'">Recent form</button>
        <button type="button" class="chip" :aria-pressed="sortBy === 'level'" @click="sortBy = 'level'">Level</button>
      </div>
      <p v-if="freeAgents.length === 0" class="muted small">No free agents{{ filter === 'All' ? '' : ` in ${filter}` }}.</p>
      <ul class="list">
        <li v-for="hero in freeAgents" :key="hero.id" class="row">
          <ClassIcon :hero-class="hero.heroClass" :size="36" />
          <RouterLink :to="`/leagues/${league?.id}/heroes/${hero.id}`" class="hero-text">
            <span class="hero-name">{{ hero.name }}</span>
            <span class="muted small">{{ hero.race }} {{ hero.heroClass }}{{ isMystery(hero) ? ' · mystery recruit' : '' }}</span>
            <span v-if="formText(hero)" class="form small">{{ formText(hero) }}</span>
            <TraitChips :traits="hero.traits" />
          </RouterLink>
          <span class="level">{{ levelText(hero) }}</span>
          <button v-if="canClaim" type="button" class="add-button" :aria-label="`Claim ${hero.name}`" @click="openClaim(hero)">Claim</button>
        </li>
      </ul>

      <h2 class="section-title">In parties</h2>
      <ul class="list">
        <li v-for="hero in drafted" :key="hero.id" class="row">
          <ClassIcon :hero-class="hero.heroClass" :size="36" />
          <RouterLink :to="`/leagues/${league?.id}/heroes/${hero.id}`" class="hero-text">
            <span class="hero-name">{{ hero.name }}</span>
            <span class="muted small">{{ hero.heroClass }} · {{ partyName(hero.partyId) }}</span>
            <span v-if="formText(hero)" class="form small">{{ formText(hero) }}</span>
            <TraitChips :traits="hero.traits" />
          </RouterLink>
          <span class="level">{{ levelText(hero) }}</span>
        </li>
      </ul>

      <template v-if="moves.length">
        <h2 class="section-title">Recent moves</h2>
        <ul class="moves">
          <li v-for="entry in moves" :key="`${entry.at}-${entry.added.heroId}`" class="move">
            <strong>{{ entry.party.name }}</strong> claimed {{ entry.added.name }}, dropped {{ entry.dropped.name }}
            <span class="muted small">· from battle {{ entry.effectiveWeek }}</span>
          </li>
        </ul>
      </template>

      <div class="save-bar" role="status">
        <span v-if="notice" class="saved-pill">✓ {{ notice }}</span>
      </div>
    </template>
  </template>

  <ClaimPanel
    v-if="claiming"
    :target="claiming.target"
    :lineup="claiming.lineup"
    :busy="claimBusy"
    :error="claimError"
    @confirm="confirmClaim"
    @cancel="claiming = null"
  />
</template>

<style scoped>
.title {
  font-size: 30px;
}
.small {
  font-size: 13px;
}
.filters {
  margin-bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #4a3f55;
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}
.chip[aria-pressed='true'] {
  border-color: var(--gold);
  background: var(--gold);
  color: var(--on-gold);
  font-weight: 700;
}
.section-title {
  margin: 16px 0 8px;
  font-size: 22px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 8px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}
.row.mystery {
  border-style: dashed;
  border-color: var(--gold);
}
.rank {
  width: 24px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
  color: var(--gold);
}
.moves {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.move {
  padding: 8px 12px;
  border-left: 2px solid var(--line-strong);
  line-height: 1.4;
}
.row-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.link-button {
  min-height: var(--tap);
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--gold);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}
.rank-all {
  min-height: 40px;
  padding: 0 12px;
  font-size: 14px;
}
.sort {
  margin: 4px 0 8px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.form {
  color: var(--gold);
}
.traits-help {
  margin: 8px 0 0;
  line-height: 1.4;
}
.hero-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--text);
  text-decoration: none;
}
.hero-name {
  font-weight: 700;
}
.level {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
  white-space: nowrap;
}
.controls {
  display: flex;
}
.icon-button {
  width: 36px;
  height: var(--tap);
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
}
.icon-button:hover {
  color: var(--text);
}
.add-button {
  min-height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--gold);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--gold);
  font-family: inherit;
  font-weight: 700;
  cursor: pointer;
}
/* A compact pill in the corner, so the list stays visible on short screens. */
.save-bar {
  position: sticky;
  bottom: 84px;
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
}
.save-button {
  min-height: var(--tap);
  padding: 0 18px;
  border-radius: 999px;
  font-size: 15px;
  box-shadow: 0 4px 14px rgb(0 0 0 / 45%);
  pointer-events: auto;
}
.saved-pill {
  min-height: var(--tap);
  padding: 0 18px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--text-muted);
  font-size: 15px;
}
</style>
