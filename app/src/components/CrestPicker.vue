<script setup lang="ts">
import { BANNERS, crestName, EMBLEMS, type BannerKey, type Crest, type EmblemKey } from '../crests'
import CrestShield from './CrestShield.vue'

const crest = defineModel<Crest>({ required: true })

function setEmblem(emblem: EmblemKey) {
  crest.value = { ...crest.value, emblem }
}
function setBanner(banner: BannerKey) {
  crest.value = { ...crest.value, banner }
}
</script>

<template>
  <div class="crest-picker">
    <div class="preview" aria-live="polite">
      <CrestShield :crest="crest" :size="112" decorative />
      <span class="preview-name">{{ crestName(crest) }}</span>
    </div>

    <fieldset>
      <legend class="field-label">Emblem</legend>
      <div class="emblems">
        <label v-for="emblem in EMBLEMS" :key="emblem.key" class="emblem" :class="{ on: crest.emblem === emblem.key }">
          <input
            class="visually-hidden"
            type="radio"
            name="emblem"
            :value="emblem.key"
            :checked="crest.emblem === emblem.key"
            @change="setEmblem(emblem.key)"
          />
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path :d="emblem.path" />
          </svg>
          <span>{{ emblem.name }}</span>
        </label>
      </div>
    </fieldset>

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
.emblems {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
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
  cursor: pointer;
}
.banner.on {
  box-shadow:
    0 0 0 2px var(--ink),
    0 0 0 4px var(--gold);
}
</style>
