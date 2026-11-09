<script setup lang="ts">
import { computed } from 'vue'
import {
  BANNERS,
  crestName,
  EMBLEMS,
  isMascot,
  MASCOT_COLORS,
  PATTERNS,
  type BannerKey,
  type Crest,
  type EmblemKey,
  type MascotColorKey,
  type PatternKey
} from '../crests'
import CrestShield from './CrestShield.vue'

/*
 * Builds a crest: an emblem (heraldry or a mascot), the banner color, and optionally a pattern that splits the
 * shield with a second color. The second color is always different from the banner, so the pattern shows.
 * A mascot's two color regions can each take a color, or keep the art's own.
 */

const crest = defineModel<Crest>({ required: true })

const groups = [
  { name: 'Heraldry', emblems: EMBLEMS.filter(emblem => !('mascot' in emblem)) },
  { name: 'Mascots', emblems: EMBLEMS.filter(emblem => 'mascot' in emblem) }
]
const pattern = computed<PatternKey>(() => crest.value.pattern ?? 'plain')
/** A second color to start a pattern with: gold reads on every banner, except gold itself */
const firstAccent = (banner: BannerKey): BannerKey => (banner === 'amber' ? 'obsidian' : 'amber')

const mascot = computed(() => isMascot(crest.value.emblem))
const regions = [
  { field: 'mascotPrimary', name: 'Mascot main color' },
  { field: 'mascotSecondary', name: 'Mascot second color' }
] as const

function setEmblem(emblem: EmblemKey) {
  // Heraldry has no color regions; switching between mascots keeps the chosen colors.
  crest.value = isMascot(emblem) ? { ...crest.value, emblem } : { ...crest.value, emblem, mascotPrimary: null, mascotSecondary: null }
}
function setMascotColor(field: (typeof regions)[number]['field'], color: MascotColorKey | null) {
  crest.value = { ...crest.value, [field]: color }
}
function setBanner(banner: BannerKey) {
  // Picking the second color as the banner swaps the two, so the pattern stays visible.
  const accent = crest.value.accent === banner ? crest.value.banner : (crest.value.accent ?? null)
  crest.value = { ...crest.value, banner, accent: pattern.value === 'plain' ? null : accent }
}
function setPattern(next: PatternKey) {
  if (next === 'plain') crest.value = { ...crest.value, pattern: 'plain', accent: null }
  else crest.value = { ...crest.value, pattern: next, accent: crest.value.accent ?? firstAccent(crest.value.banner) }
}
function setAccent(accent: BannerKey) {
  if (accent !== crest.value.banner) crest.value = { ...crest.value, accent }
}
/** Each pattern previewed on the current crest */
const sample = (key: PatternKey): Crest => ({ ...crest.value, pattern: key, accent: key === 'plain' ? null : (crest.value.accent ?? firstAccent(crest.value.banner)) })
</script>

<template>
  <div class="crest-picker">
    <div class="preview" aria-live="polite">
      <CrestShield :crest="crest" :size="112" decorative />
      <span class="preview-name">{{ crestName(crest) }}</span>
    </div>

    <fieldset>
      <legend class="field-label">Emblem</legend>
      <template v-for="group in groups" :key="group.name">
        <p class="group-name muted">{{ group.name }}</p>
        <div class="emblems">
          <label v-for="emblem in group.emblems" :key="emblem.key" class="emblem" :class="{ on: crest.emblem === emblem.key }">
            <input
              class="visually-hidden"
              type="radio"
              name="emblem"
              :value="emblem.key"
              :checked="crest.emblem === emblem.key"
              @change="setEmblem(emblem.key)"
            />
            <img v-if="'image' in emblem" class="mascot" :src="emblem.image" width="36" height="36" alt="" />
            <svg
              v-else
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="emblem.path" />
            </svg>
            <span>{{ emblem.name }}</span>
          </label>
        </div>
      </template>
    </fieldset>

    <template v-if="mascot">
      <fieldset v-for="region in regions" :key="region.field">
        <legend class="field-label">{{ region.name }}</legend>
        <div class="banners">
          <label class="banner original" :class="{ on: !crest[region.field] }">
            <input
              class="visually-hidden"
              type="radio"
              :name="region.field"
              value=""
              :checked="!crest[region.field]"
              @change="setMascotColor(region.field, null)"
            />
            <span>Original</span>
          </label>
          <label
            v-for="color in MASCOT_COLORS"
            :key="color.key"
            class="banner"
            :class="{ on: crest[region.field] === color.key }"
            :style="{ background: color.hex }"
          >
            <input
              class="visually-hidden"
              type="radio"
              :name="region.field"
              :value="color.key"
              :checked="crest[region.field] === color.key"
              @change="setMascotColor(region.field, color.key)"
            />
            <span class="visually-hidden">{{ color.name }}</span>
          </label>
        </div>
      </fieldset>
    </template>

    <fieldset>
      <legend class="field-label">Banner color</legend>
      <div class="banners">
        <label
          v-for="banner in BANNERS"
          :key="banner.key"
          class="banner"
          :class="{ on: crest.banner === banner.key }"
          :style="{ background: banner.hex }"
        >
          <input
            class="visually-hidden"
            type="radio"
            name="banner"
            :value="banner.key"
            :checked="crest.banner === banner.key"
            @change="setBanner(banner.key)"
          />
          <span class="visually-hidden">{{ banner.name }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend class="field-label">Pattern</legend>
      <div class="patterns">
        <label v-for="option in PATTERNS" :key="option.key" class="emblem pattern" :class="{ on: pattern === option.key }">
          <input
            class="visually-hidden"
            type="radio"
            name="pattern"
            :value="option.key"
            :checked="pattern === option.key"
            @change="setPattern(option.key)"
          />
          <CrestShield :crest="sample(option.key)" :size="30" decorative />
          <span>{{ option.name }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset v-if="pattern !== 'plain'">
      <legend class="field-label">Second color</legend>
      <div class="banners">
        <label
          v-for="banner in BANNERS"
          :key="banner.key"
          class="banner"
          :class="{ on: crest.accent === banner.key, off: crest.banner === banner.key }"
          :style="{ background: banner.hex }"
        >
          <input
            class="visually-hidden"
            type="radio"
            name="accent"
            :value="banner.key"
            :checked="crest.accent === banner.key"
            :disabled="crest.banner === banner.key"
            @change="setAccent(banner.key)"
          />
          <span class="visually-hidden">{{ banner.name }}{{ crest.banner === banner.key ? ' (the banner color)' : '' }}</span>
        </label>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.crest-picker {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.preview-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
}
fieldset {
  margin: 0;
  padding: 0;
  border: 0;
}
legend {
  margin-bottom: 8px;
}
.group-name {
  margin: 0 0 6px;
  font-size: 13px;
}
.group-name:not(:first-of-type) {
  margin-top: 12px;
}
.emblems,
.patterns {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.patterns {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.emblem {
  min-height: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  font-size: 12px;
  cursor: pointer;
}
.emblem.on {
  border-color: var(--gold);
  background: #2a2433;
  color: var(--gold);
}
.emblem:focus-within,
.banner:focus-within {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
.banners {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.banner {
  width: var(--tap);
  height: var(--tap);
  border-radius: 50%;
  /* An edge so the darkest colors (obsidian, black) still read as swatches */
  border: 1px solid var(--line-strong);
  cursor: pointer;
}
.banner.on {
  box-shadow:
    0 0 0 2px var(--ink),
    0 0 0 4px var(--gold);
}
.mascot {
  object-fit: contain;
  /* The same light edge the shield gives mascots, so dark art (wolf, dragon) reads on the dark tile */
  filter: drop-shadow(0 0 0.6px rgba(255, 248, 236, 0.9)) drop-shadow(0 0 0.6px rgba(255, 248, 236, 0.9));
}
.banner.original {
  display: grid;
  place-items: center;
  width: auto;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 13px;
}
.banner.off {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>
