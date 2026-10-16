<script setup lang="ts">
import type { HeroClass } from '../api/types'
import { CLASS_COLOR, CLASS_ICON } from '../heroes'

withDefaults(defineProps<{ heroClass: HeroClass; size?: number }>(), { size: 40 })
</script>

<template>
  <span class="class-icon" :style="{ width: `${size}px`, height: `${size}px`, color: CLASS_COLOR[heroClass] }" aria-hidden="true">
    <svg :width="Math.round(size * 0.55)" :height="Math.round(size * 0.55)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path :d="CLASS_ICON[heroClass]" />
    </svg>
  </span>
</template>

<style scoped>
.class-icon {
  flex: none;
  border-radius: 50%;
  background: color-mix(in srgb, currentColor 18%, var(--ink));
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
