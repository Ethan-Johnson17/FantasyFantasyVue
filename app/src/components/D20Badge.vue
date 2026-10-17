<script setup lang="ts">
import type { Crit } from '../api/types'

/* A small d20 showing a natural 20 or a natural 1. */
withDefaults(defineProps<{ crit: Crit; size?: number }>(), { size: 26 })
</script>

<template>
  <span class="d20" :class="crit" :style="{ width: `${size}px`, height: `${size}px` }" role="img" :aria-label="crit === 'success' ? 'Natural 20' : 'Natural 1'">
    <svg :width="size" :height="size" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
      <path d="M16 2l12 7v14l-12 7-12-7V9z" />
      <path d="M16 2l-6 11h12zM10 13l-6-4M22 13l6-4M10 13l6 17 6-17M4 23l6-10M28 23l-6-10" opacity="0.35" />
    </svg>
    <span class="roll">{{ crit === 'success' ? 20 : 1 }}</span>
  </span>
</template>

<style scoped>
.d20 {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.d20 svg {
  position: absolute;
  inset: 0;
}
.roll {
  position: relative;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.8em;
  line-height: 1;
}
.success {
  color: var(--gold-bright);
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--gold) 60%, transparent));
}
.fail {
  color: var(--danger);
}
</style>
