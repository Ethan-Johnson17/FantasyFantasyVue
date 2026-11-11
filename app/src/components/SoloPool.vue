<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { HeroClass, SoloHero } from '../api/types'
import { HERO_CLASSES, levelText } from '../heroes'
import { filterPool, goldText, POSITIONS, sortPool, SORTS, type PoolFilter, type SoloSort } from '../solo'
import { kickoffText } from '../time'
import ClassIcon from './ClassIcon.vue'
import PlayerTag from './PlayerTag.vue'
import TraitChips from './TraitChips.vue'

/*
 * A Solo run's pool (docs/SOLO_SPEC.md, "What users see"): every hero with their player, Level, price and projection,
 * filtered by position and class, searched by name or team, and sorted. A page at a time: the pool holds hundreds.
 */

const props = defineProps<{
  heroes: readonly SoloHero[]
  /** The button on each row */
  actionLabel: string
  /** Why a hero can't be chosen now, or null */
  problem: (hero: SoloHero) => string | null
  disabled?: boolean
}>()
const emit = defineEmits<{ choose: [hero: SoloHero] }>()

const PAGE = 40
const filter = reactive<PoolFilter>({ position: null, heroClass: null, query: '' })
const sort = ref<SoloSort>('level')
const shown = ref(PAGE)
watch([() => ({ ...filter }), sort], () => {
  shown.value = PAGE
})

const matches = computed(() => sortPool(filterPool(props.heroes, filter), sort.value))
const visible = computed(() => matches.value.slice(0, shown.value))

function gameText(hero: SoloHero): string {
  if (hero.locked) return 'Kicked off · locked'
  return hero.kickoff ? kickoffText(new Date(hero.kickoff)) : ''
}
const setClass = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value
  filter.heroClass = value ? (value as HeroClass) : null
}
</script>

<template>
  <div class="filters">
    <div class="positions" role="group" aria-label="Position">
      <button type="button" class="chip" :class="{ on: !filter.position }" :aria-pressed="!filter.position" @click="filter.position = null">All</button>
      <button
        v-for="position in POSITIONS"
        :key="position"
        type="button"
        class="chip"
        :class="{ on: filter.position === position }"
        :aria-pressed="filter.position === position"
        @click="filter.position = filter.position === position ? null : position"
      >
        {{ position }}
      </button>
    </div>
    <div class="row-fields">
      <label class="field-inline">
        <span class="visually-hidden">Class</span>
        <select class="input" :value="filter.heroClass ?? ''" aria-label="Class" @change="setClass">
          <option value="">Every class</option>
          <option v-for="heroClass in HERO_CLASSES" :key="heroClass" :value="heroClass">{{ heroClass }}s</option>
        </select>
      </label>
      <label class="field-inline">
        <span class="visually-hidden">Sort by</span>
        <select v-model="sort" class="input" aria-label="Sort by">
          <option v-for="option in SORTS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
    </div>
    <input v-model="filter.query" class="input" type="search" placeholder="Search players or teams" aria-label="Search players or teams" autocomplete="off" />
  </div>

  <p class="muted small" role="status">{{ matches.length }} {{ matches.length === 1 ? 'hero' : 'heroes' }}</p>
  <ul class="pool">
    <li v-for="hero in visible" :key="hero.id" class="hero" :class="{ locked: hero.locked }">
      <ClassIcon :hero-class="hero.heroClass" :size="28" />
      <span class="text">
        <span class="name">{{ hero.name }}</span>
        <PlayerTag :hero="hero" />
        <span class="muted small">
          {{ hero.heroClass }} · proj {{ hero.projected }}<template v-if="gameText(hero)"> · <span v-if="hero.locked" aria-hidden="true">🔒 </span>{{ gameText(hero) }}</template>
        </span>
        <TraitChips :traits="hero.traits" />
        <span v-if="problem(hero)" class="problem small">{{ problem(hero) }}</span>
      </span>
      <span class="numbers">
        <span class="level">{{ levelText(hero) }}</span>
        <span class="cost small">{{ goldText(hero.cost) }}</span>
        <button
          type="button"
          class="btn btn-secondary choose"
          :disabled="disabled || !!problem(hero)"
          :aria-label="`${actionLabel} ${hero.name}`"
          @click="emit('choose', hero)"
        >
          {{ actionLabel }}
        </button>
      </span>
    </li>
  </ul>
  <button v-if="matches.length > shown" type="button" class="btn btn-secondary more" @click="shown += PAGE">
    Show more ({{ matches.length - shown }} left)
  </button>
</template>

<style scoped>
.small {
  font-size: 13px;
}
.filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 6px;
}
.positions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-family: inherit;
  font-weight: 700;
  cursor: pointer;
}
.chip.on {
  border-color: var(--gold);
  color: var(--text);
  background: var(--surface-raised);
}
.row-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.pool {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hero {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.hero.locked {
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
.problem {
  color: var(--text-muted);
  font-style: italic;
}
.numbers {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.level {
  font-weight: 700;
  color: var(--gold);
}
.cost {
  font-variant-numeric: tabular-nums;
}
.choose {
  min-height: 36px;
  padding: 0 12px;
}
.more {
  width: 100%;
  margin-top: 8px;
}
</style>
