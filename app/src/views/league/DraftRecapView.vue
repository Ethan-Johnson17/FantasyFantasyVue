<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../../api/inject'
import type { Hero } from '../../api/types'
import FormError from '../../components/FormError.vue'
import { CLASS_COLOR, HERO_CLASSES, isMystery, levelText } from '../../heroes'
import { useLeague } from '../../league'

const api = useApi()
const { league, myParty } = useLeague()
const heroes = ref<Hero[]>([])
const ranked = ref<Set<string>>(new Set())
const error = ref<unknown>(null)

onMounted(async () => {
  if (!league.value?.draft) return
  try {
    const [pool, ranking] = await Promise.all([api.listHeroes(league.value.id), api.getRankings(league.value.id)])
    heroes.value = pool
    ranked.value = new Set(ranking.heroIds)
  } catch (caught) {
    error.value = caught
  }
})

const byId = computed(() => new Map(heroes.value.map(hero => [hero.id, hero])))
const myPicks = computed(() =>
  (league.value?.draft?.picks ?? [])
    .filter(pick => pick.partyId === myParty.value?.id)
    .flatMap(pick => {
      const hero = byId.value.get(pick.heroId)
      return hero ? [{ ...pick, hero, auto: !ranked.value.has(hero.id) }] : []
    })
)
const pickPosition = computed(() => (league.value?.draft?.order.indexOf(myParty.value?.id ?? '') ?? -1) + 1)
const fromRanking = computed(() => myPicks.value.filter(pick => !pick.auto).length)
const classMix = computed(() =>
  HERO_CLASSES.map(heroClass => ({ heroClass, count: myPicks.value.filter(pick => pick.hero.heroClass === heroClass).length }))
)
const ordinal = (n: number) => `${String(n)}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`
</script>

<template>
  <header class="page-header">
    <RouterLink :to="`/leagues/${league?.id}`" class="back-link">‹ {{ league?.name }}</RouterLink>
    <h1 class="title">The draft is done</h1>
    <div v-if="myPicks.length" class="muted">
      You picked {{ ordinal(pickPosition) }} · {{ fromRanking }} of {{ myPicks.length }} picks came from your ranking
    </div>
  </header>

  <FormError :error="error" />
  <p v-if="!league?.draft" class="card muted">The draft hasn't run yet.</p>

  <template v-if="myPicks.length">
    <div class="mix">
      <div v-for="entry in classMix" :key="entry.heroClass" class="mix-cell">
        <span class="mix-count" :style="{ color: CLASS_COLOR[entry.heroClass] }">{{ entry.count }}</span>
        <span class="muted tiny">{{ entry.heroClass }}{{ entry.count === 1 ? '' : 's' }}</span>
      </div>
    </div>

    <ol class="picks">
      <li v-for="pick in myPicks" :key="pick.overall" class="pick" :class="{ auto: pick.auto }">
        <span class="muted small">R{{ pick.round }} · {{ pick.overall }}</span>
        <RouterLink :to="`/leagues/${league?.id}/heroes/${pick.hero.id}`" class="pick-name">
          <strong>{{ pick.hero.name }}</strong>
          <span :style="{ color: CLASS_COLOR[pick.hero.heroClass] }"> {{ pick.hero.heroClass }}</span>
          <span v-if="pick.auto" class="auto-tag"> auto</span>
        </RouterLink>
        <span class="level" :class="{ mystery: isMystery(pick.hero) }">{{ levelText(pick.hero) }}</span>
      </li>
    </ol>

    <p class="note recap-note">Your starting five was set by Level. You can change it any time before each battle.</p>
    <RouterLink :to="`/leagues/${league?.id}/party`" class="btn btn-primary set-lineup">Set my lineup</RouterLink>
  </template>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.small {
  font-size: 13px;
}
.tiny {
  font-size: 12px;
}
.mix {
  margin: 4px 0 10px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  text-align: center;
}
.mix-cell {
  padding: 8px 2px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
}
.mix-count {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
}
.picks {
  list-style: none;
  margin: 0;
  padding: 0;
}
.pick {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: var(--tap);
  border-bottom: 1px solid #2a2433;
}
.pick.auto {
  border-bottom-style: dashed;
  border-bottom-color: var(--gold);
}
.pick-name {
  color: var(--text);
  text-decoration: none;
}
.auto-tag {
  font-size: 13px;
  color: var(--gold);
}
.level {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
}
.level.mystery {
  color: var(--gold);
}
.recap-note {
  margin-top: 14px;
}
.set-lineup {
  margin-top: 14px;
  width: 100%;
}
</style>
