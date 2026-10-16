<script setup lang="ts">
import type { HeroTrait } from '../api/types'
import { TRAITS } from '../heroes'

defineProps<{ traits: readonly HeroTrait[] }>()
</script>

<template>
  <span v-if="traits.length" class="traits">
    <span v-for="trait in traits" :key="trait" class="trait" :class="trait" :title="TRAITS[trait].description">
      {{ TRAITS[trait].label }}
    </span>
  </span>
</template>

<style scoped>
.traits {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.trait {
  padding: 0 7px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
.steadfast {
  color: var(--trait-steadfast);
}
.wild {
  color: var(--trait-wild);
}
.mighty {
  color: var(--trait-mighty);
}
</style>
