<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../../api/inject'
import type { HeroDetail } from '../../api/types'
import ClassIcon from '../../components/ClassIcon.vue'
import FormError from '../../components/FormError.vue'
import { CLASS_COLOR, CLASS_TEMPERAMENT, isMystery, levelText } from '../../heroes'
import { useLeague } from '../../league'
import { SEASON_WEEKS } from '../../time'

const api = useApi()
const route = useRoute()
const { league } = useLeague()
const detail = ref<HeroDetail | null>(null)
const error = ref<unknown>(null)

onMounted(async () => {
  if (!league.value) return
  try {
    detail.value = await api.getHero(league.value.id, String(route.params.heroId))
  } catch (caught) {
    error.value = caught
  }
})

const hero = computed(() => detail.value?.hero ?? null)
const owner = computed(() => league.value?.parties.find(party => party.id === hero.value?.partyId) ?? null)
const played = computed(() => detail.value?.history.filter(week => !week.resting) ?? [])
const average = computed(() =>
  played.value.length ? Math.round(played.value.reduce((sum, week) => sum + week.damage, 0) / played.value.length) : null
)
const maxDamage = computed(() => Math.max(1, ...(detail.value?.history.map(week => week.damage) ?? [])))
const latestWeek = computed(() => Math.max(0, ...(detail.value?.history.map(week => week.week) ?? [])))
const bars = computed(() =>
  Array.from({ length: SEASON_WEEKS }, (_, index) => {
    const week = detail.value?.history.find(entry => entry.week === index + 1)
    return { week: index + 1, entry: week ?? null, height: week ? Math.max(4, Math.round((week.damage / maxDamage.value) * 100)) : 0 }
  })
)
const chartLabel = computed(() =>
  (detail.value?.history ?? [])
    .map(week => `week ${String(week.week)}, ${week.resting ? 'resting' : String(week.damage)}`)
    .join('; ') || 'No battles yet'
)
</script>

<template>
  <header class="page-header">
    <button type="button" class="back-link back-button" @click="$router.back()">‹ Back</button>
  </header>

  <FormError :error="error" />

  <template v-if="hero">
    <section class="hero-header">
      <ClassIcon :hero-class="hero.heroClass" :size="112" />
      <h1 class="name">{{ hero.name }}</h1>
      <div class="muted">{{ hero.race }} {{ hero.heroClass }} · wields a {{ hero.weapon }}</div>
      <div class="chips">
        <span class="chip level">{{ isMystery(hero) ? `Mystery ${levelText(hero)}` : levelText(hero).replace('Lv', 'Level') }}</span>
        <span class="chip" :style="{ color: CLASS_COLOR[hero.heroClass], borderColor: CLASS_COLOR[hero.heroClass] }">
          {{ CLASS_TEMPERAMENT[hero.heroClass].label }}
        </span>
        <span class="chip">{{ owner ? owner.name : 'Undrafted' }}</span>
      </div>
    </section>

    <section class="card skill">
      <h2 class="skill-name">{{ hero.skill }}</h2>
      <p class="muted">{{ CLASS_TEMPERAMENT[hero.heroClass].description }}</p>
      <p v-if="isMystery(hero)" class="muted">A mystery recruit: their true strength shows once the battles begin.</p>
    </section>

    <section class="history">
      <div class="row-heading">
        <h2 class="section-title">Damage this season</h2>
        <span v-if="average !== null" class="muted small">Average {{ average }}</span>
      </div>
      <div class="chart" role="img" :aria-label="chartLabel">
        <div
          v-for="bar in bars"
          :key="bar.week"
          class="bar"
          :class="{ resting: bar.entry?.resting, empty: !bar.entry, latest: bar.week === latestWeek }"
          :style="{ height: bar.entry && !bar.entry.resting ? `${bar.height}%` : undefined }"
        ></div>
      </div>
      <div class="axis muted small"><span>Week 1</span><span>Week {{ SEASON_WEEKS }}</span></div>
    </section>
  </template>
</template>

<style scoped>
.back-button {
  border: 0;
  background: transparent;
  color: var(--gold);
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}
.small {
  font-size: 13px;
}
.hero-header {
  padding: 4px 0 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}
.name {
  font-size: 34px;
  line-height: 1;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.chip {
  padding: 4px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  font-size: 15px;
}
.chip.level {
  border-color: var(--gold);
  background: var(--gold);
  color: var(--on-gold);
  font-weight: 700;
}
.skill {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.skill p {
  margin: 0;
  line-height: 1.45;
}
.skill-name {
  font-size: 20px;
}
.history {
  margin-top: 14px;
}
.row-heading {
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.section-title {
  font-size: 20px;
}
.chart {
  height: 120px;
  display: grid;
  grid-template-columns: repeat(14, minmax(0, 1fr));
  gap: 4px;
  align-items: end;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--line);
}
.bar {
  border-radius: 3px 3px 0 0;
  background: #6b5a85;
}
.bar.latest:not(.resting) {
  background: var(--gold);
}
.bar.resting {
  height: 8px;
  border: 1px dashed var(--line-strong);
  background: transparent;
}
.bar.empty {
  height: 0;
}
.axis {
  display: flex;
  justify-content: space-between;
}
</style>
