<script setup lang="ts">
import type { Encounter } from '../api/types'
import { CLASS_COLOR } from '../heroes'

/* A Crossover week's encounter: the monster the Quest party fights, what it's weak to and what it resists. */

withDefaults(defineProps<{ encounter: Encounter; weakMultiplier?: number; resistMultiplier?: number }>(), {
  weakMultiplier: 1.25,
  resistMultiplier: 0.75
})
const times = (value: number) => `×${String(value)}`
</script>

<template>
  <section class="encounter" aria-label="This week's encounter">
    <span class="mark" aria-hidden="true">☠</span>
    <div class="text">
      <span class="eyebrow-text">Quest encounter</span>
      <span class="name">{{ encounter.name }}</span>
      <span class="mods small">
        Weak to
        <template v-for="(heroClass, index) in encounter.weak" :key="heroClass">
          <strong :style="{ color: CLASS_COLOR[heroClass] }">{{ heroClass }}s</strong>{{ index === 0 ? ' and ' : '' }}
        </template>
        {{ times(weakMultiplier) }} · resists <strong :style="{ color: CLASS_COLOR[encounter.resists] }">{{ encounter.resists }}s</strong>
        {{ times(resistMultiplier) }}
      </span>
    </div>
  </section>
</template>

<style scoped>
.encounter {
  margin: 10px 0;
  padding: 12px 14px;
  display: flex;
  gap: 12px;
  align-items: center;
  border: 1px dashed var(--danger);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.mark {
  flex: none;
  font-size: 28px;
  color: var(--danger);
}
.text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.eyebrow-text {
  color: var(--text-muted);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
}
.small {
  font-size: 13px;
}
</style>
