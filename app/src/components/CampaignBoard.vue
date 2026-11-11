<script setup lang="ts">
import { computed } from 'vue'
import type { Campaign } from '../api/types'
import { chapterTitle, currentChapter, deadlineText, hpPercent, hpShown, livesText } from '../campaign'
import { CLASS_COLOR } from '../heroes'

/*
 * Co-op's campaign at a glance: the monster the whole league is fighting, its HP, its weaknesses and deadline, and
 * the league's lives. Once the campaign is over, its outcome. Solo: the same board for one party's run.
 */

const props = withDefaults(
  defineProps<{
    campaign: Campaign
    weakMultiplier?: number | undefined
    resistMultiplier?: number | undefined
    leagueId?: string | null
    solo?: boolean
  }>(),
  { weakMultiplier: 1.25, resistMultiplier: 0.75, leagueId: null, solo: false }
)

const chapter = computed(() => currentChapter(props.campaign))
const left = computed(() => (chapter.value ? hpShown(chapter.value.hpLeft) : 0))
const times = (value: number) => `×${String(value)}`
const lives = computed(() => Array.from({ length: props.campaign.lives }, (_, index) => index < props.campaign.livesLeft))
</script>

<template>
  <section class="board" :class="campaign.outcome" aria-label="The campaign">
    <div class="top">
      <span class="eyebrow-text">
        <template v-if="campaign.outcome === 'won'">Victory</template>
        <template v-else-if="campaign.outcome === 'lost'">Defeat</template>
        <template v-else-if="chapter">{{ chapterTitle(chapter, campaign.chapters.length) }}</template>
      </span>
      <span class="lives" role="img" :aria-label="livesText(campaign.livesLeft, campaign.lives)">
        <span v-for="(alive, index) in lives" :key="index" class="life" :class="{ lost: !alive }" aria-hidden="true">♥</span>
      </span>
    </div>

    <template v-if="campaign.outcome === 'won'">
      <p class="headline">The boss has fallen. {{ solo ? 'Your party wins the run!' : 'The league wins the campaign!' }}</p>
    </template>
    <template v-else-if="campaign.outcome === 'lost'">
      <p v-if="campaign.abandoned" class="headline">The run was abandoned<template v-if="chapter"> at {{ chapter.boss ? 'the boss raid' : `chapter ${chapter.chapter}` }}</template>.</p>
      <p v-else class="headline">
        The {{ solo ? 'run' : 'campaign' }} is lost<template v-if="chapter"> at {{ chapter.boss ? 'the boss raid' : `chapter ${chapter.chapter}` }}</template>.
      </p>
    </template>
    <template v-else-if="chapter">
      <div class="monster">
        <span class="mark" aria-hidden="true">☠</span>
        <div class="text">
          <span class="name">{{ chapter.name }}</span>
          <span class="mods small">
            Weak to
            <template v-for="(heroClass, index) in chapter.weak" :key="heroClass">
              <strong :style="{ color: CLASS_COLOR[heroClass] }">{{ heroClass }}s</strong>{{ index === 0 ? ' and ' : '' }}
            </template>
            {{ times(weakMultiplier) }} · resists <strong :style="{ color: CLASS_COLOR[chapter.resists] }">{{ chapter.resists }}s</strong>
            {{ times(resistMultiplier) }}
          </span>
        </div>
      </div>
      <div
        class="hp"
        role="progressbar"
        aria-label="Monster HP left"
        :aria-valuenow="left"
        aria-valuemin="0"
        :aria-valuemax="chapter.hp"
        :aria-valuetext="`${left.toLocaleString()} of ${chapter.hp.toLocaleString()} HP left`"
      >
        <div class="hp-fill" :style="{ width: `${hpPercent(chapter.hpLeft, chapter.hp)}%` }"></div>
      </div>
      <div class="hp-text small">
        <span><strong>{{ left.toLocaleString() }}</strong> of {{ chapter.hp.toLocaleString() }} HP</span>
        <span class="muted">{{ deadlineText(chapter, campaign.nextWeek?.week ?? null) }}</span>
      </div>
    </template>

    <RouterLink v-if="leagueId" :to="`/leagues/${leagueId}/quest`" class="open small">Open the quest board ›</RouterLink>
  </section>
</template>

<style scoped>
.board {
  margin: 10px 0;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--danger);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.board.won {
  border-color: var(--gold);
}
.board.lost {
  border-color: var(--line-strong);
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.eyebrow-text {
  color: var(--text-muted);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.won .eyebrow-text {
  color: var(--gold);
}
.lives {
  display: flex;
  gap: 2px;
  font-size: 18px;
  color: var(--danger);
}
.life.lost {
  color: var(--line-strong);
}
.headline {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
}
.monster {
  display: flex;
  gap: 12px;
  align-items: center;
}
.mark {
  flex: none;
  font-size: 30px;
  color: var(--danger);
}
.text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
}
.hp {
  height: 12px;
  border-radius: 6px;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  overflow: hidden;
}
.hp-fill {
  height: 100%;
  background: var(--danger);
  transition: width 0.4s ease;
}
.hp-text {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
}
.small {
  font-size: 13px;
}
.open {
  align-self: flex-start;
}
</style>
