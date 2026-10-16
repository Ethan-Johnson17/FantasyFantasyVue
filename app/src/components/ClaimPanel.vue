<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Hero, Lineup } from '../api/types'
import { levelText } from '../heroes'
import ClassIcon from './ClassIcon.vue'
import FormError from './FormError.vue'
import TraitChips from './TraitChips.vue'

/* Choose which of your heroes to drop for a free agent, then confirm. */

const props = defineProps<{ target: Hero; lineup: Lineup; busy: boolean; error: unknown }>()
const emit = defineEmits<{ confirm: [dropHeroId: string]; cancel: [] }>()

const dropId = ref<string | null>(null)
const starters = computed(() => new Set(Object.values(props.lineup.lineup ?? {})))
// Bench heroes first: they're the usual drop.
const roster = computed(() =>
  [...props.lineup.roster].sort((a, b) => Number(starters.value.has(a.id)) - Number(starters.value.has(b.id)))
)
const dropping = computed(() => roster.value.find(hero => hero.id === dropId.value) ?? null)
const panel = ref<HTMLElement | null>(null)

onMounted(() => panel.value?.focus())
</script>

<template>
  <div class="backdrop" @click.self="emit('cancel')">
    <section ref="panel" class="panel" role="dialog" aria-modal="true" aria-labelledby="claim-title" tabindex="-1" @keydown.esc="emit('cancel')">
      <h2 id="claim-title" class="title">Claim {{ target.name }}</h2>
      <p class="muted small">Choose a hero to drop. They become a free agent anyone can claim.</p>
      <ul class="roster">
        <li v-for="hero in roster" :key="hero.id">
          <label class="option" :class="{ chosen: dropId === hero.id }">
            <input v-model="dropId" type="radio" name="drop" :value="hero.id" />
            <ClassIcon :hero-class="hero.heroClass" :size="32" />
            <span class="text">
              <span class="name">{{ hero.name }}</span>
              <span class="muted small">
                {{ hero.heroClass }} · {{ starters.has(hero.id) ? 'starting' : 'bench' }}{{ lineup.champion === hero.id ? ' · ♛ Champion' : '' }}
              </span>
              <TraitChips :traits="hero.traits" />
            </span>
            <span class="level">{{ levelText(hero) }}</span>
          </label>
        </li>
      </ul>
      <FormError :error="error" />
      <div class="actions">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="!dropping || busy" @click="dropping && emit('confirm', dropping.id)">
          {{ busy ? 'Claiming…' : dropping ? `Drop ${dropping.name}` : 'Choose a hero' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgb(0 0 0 / 60%);
}
.panel {
  width: min(100%, 520px);
  max-height: 85vh;
  overflow-y: auto;
  padding: 18px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--ink);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  outline: none;
}
.title {
  font-size: 24px;
}
.small {
  font-size: 13px;
}
.roster {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
}
.option.chosen {
  border-color: var(--gold);
}
.option input {
  width: 20px;
  height: 20px;
  accent-color: var(--gold);
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
.level {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
  color: var(--gold);
}
.actions {
  position: sticky;
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding-top: 8px;
  background: var(--ink);
}
</style>
