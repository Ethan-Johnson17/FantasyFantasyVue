<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApi } from '../../api/inject'
import type { Hero, HeroClass } from '../../api/types'
import ClassIcon from '../../components/ClassIcon.vue'
import FormError from '../../components/FormError.vue'
import TraitChips from '../../components/TraitChips.vue'
import { CLASS_COLOR, HERO_CLASSES, isMystery, levelText, levelValue } from '../../heroes'
import { useLeague } from '../../league'
import { timeUntil } from '../../time'

const api = useApi()
const { league } = useLeague()

const heroes = ref<Hero[]>([])
const ranking = ref<string[]>([])
const savedRanking = ref<string[]>([])
const filter = ref<HeroClass | 'All'>('All')
const saving = ref(false)
const notice = ref('')
const error = ref<unknown>(null)

const drafting = computed(() => league.value?.status === 'drafting')

onMounted(async () => {
  if (!league.value || league.value.status === 'forming') return
  try {
    heroes.value = await api.listHeroes(league.value.id)
    if (drafting.value) {
      const saved = await api.getRankings(league.value.id)
      ranking.value = [...saved.heroIds]
      savedRanking.value = [...saved.heroIds]
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
const partyName = (partyId: string | null) => league.value?.parties.find(party => party.id === partyId)?.name ?? 'Undrafted'

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
      <p class="note">On your turn, the draft takes your highest-ranked hero still available. If none are left, it picks the best Level for you.</p>
      <p class="muted small traits-help">
        Look past Level: a Steadfast and a Wild hero fighting together deal bonus damage, Mighty heroes make the
        strongest Champions, and a Wild Champion guarded by a Steadfast ally never has a truly bad battle.
      </p>

      <h2 class="section-title">Your ranking</h2>
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

      <h2 class="section-title">Pool</h2>
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

    <!-- After the draft: who's where -->
    <ul v-else class="list">
      <li v-for="hero in heroes.filter(matches)" :key="hero.id" class="row">
        <ClassIcon :hero-class="hero.heroClass" :size="36" />
        <RouterLink :to="`/leagues/${league?.id}/heroes/${hero.id}`" class="hero-text">
          <span class="hero-name">{{ hero.name }}</span>
          <span class="muted small">{{ hero.heroClass }} · {{ partyName(hero.partyId) }}</span>
          <TraitChips :traits="hero.traits" />
        </RouterLink>
        <span class="level">{{ levelText(hero) }}</span>
      </li>
    </ul>
  </template>
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
