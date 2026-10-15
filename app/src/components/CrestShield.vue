<script setup lang="ts">
import { computed } from 'vue'
import { bannerOf, crestName, emblemOf, type Crest } from '../crests'

const props = withDefaults(defineProps<{ crest: Crest; size?: number; decorative?: boolean }>(), {
  size: 44,
  decorative: false
})

const fill = computed(() => bannerOf(props.crest.banner).hex)
const path = computed(() => emblemOf(props.crest.emblem).path)
const label = computed(() => `${crestName(props.crest)} crest`)
</script>

<template>
  <svg
    :width="size"
    :height="Math.round(size * 1.125)"
    viewBox="0 0 64 72"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : label"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <path d="M32 3l27 9v20c0 18-12 30-27 37C17 62 5 50 5 32V12z" :fill="fill" stroke="var(--gold)" stroke-width="2" />
    <g transform="translate(17 17) scale(1.25)">
      <path
        :d="path"
        fill="none"
        stroke="#FFF8EC"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
  </svg>
</template>
