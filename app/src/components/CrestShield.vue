<script setup lang="ts">
import { computed, useId } from 'vue'
import { accentOf, bannerOf, crestName, emblemOf, mascotColorVars, patternOf, type Crest } from '../crests'

const props = withDefaults(defineProps<{ crest: Crest; size?: number; decorative?: boolean }>(), {
  size: 44,
  decorative: false
})

const SHIELD = 'M32 3l27 9v20c0 18-12 30-27 37C17 62 5 50 5 32V12z'
const id = useId()
const clipId = `crest-${id}`
const outlineId = `crest-outline-${id}`
const fill = computed(() => bannerOf(props.crest.banner).hex)
const accent = computed(() => accentOf(props.crest))
const area = computed(() => (accent.value ? patternOf(props.crest.pattern).area : ''))
const emblem = computed(() => emblemOf(props.crest.emblem))
/** A heraldic emblem's line drawing, or a mascot's full-color image */
const path = computed(() => ('path' in emblem.value ? emblem.value.path : ''))
const image = computed(() => ('image' in emblem.value ? emblem.value.image : ''))
const colorVars = computed(() => mascotColorVars(props.crest))
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
    <defs v-if="area || image">
      <clipPath :id="clipId"><path :d="SHIELD" /></clipPath>
      <!-- A thin light outline lets dark mascots (wolf, dragon) read on dark banners -->
      <filter v-if="image" :id="outlineId" x="-10%" y="-10%" width="120%" height="120%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="0.9" result="grown" />
        <feFlood flood-color="#FFF8EC" flood-opacity="0.85" />
        <feComposite in2="grown" operator="in" result="outline" />
        <feMerge>
          <feMergeNode in="outline" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <path :d="SHIELD" :fill="fill" />
    <path v-if="area && accent" :d="area" :fill="accent.hex" :clip-path="`url(#${clipId})`" />
    <!-- <use> rather than <image>, so the chosen mascot colors (CSS variables) reach the art's paths -->
    <use
      v-if="image"
      :href="`${image}#m`"
      x="13"
      y="12"
      width="38"
      height="40"
      :style="colorVars"
      :filter="`url(#${outlineId})`"
      :clip-path="`url(#${clipId})`"
    />
    <g v-else transform="translate(17 17) scale(1.25)">
      <!-- A dark halo keeps the emblem legible where it crosses a pattern line -->
      <path
        v-if="area"
        :d="path"
        fill="none"
        stroke="rgba(20, 16, 26, 0.55)"
        stroke-width="3.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        :d="path"
        fill="none"
        stroke="#FFF8EC"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
    <!-- The gold rim goes on last, over the art -->
    <path :d="SHIELD" fill="none" stroke="var(--gold)" stroke-width="2" />
  </svg>
</template>
