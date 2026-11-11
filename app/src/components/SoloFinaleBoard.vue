<script setup lang="ts">
import { computed } from 'vue'
import type { SoloAward, SoloFinale, SoloHeroRef } from '../api/types'
import { chapterTitle, damageText, hpShown, livesText } from '../campaign'

/*
 * The end of a Solo run (docs/SOLO_SPEC.md, "What users see"): victory or defeat (an abandoned run is a defeat), how
 * each chapter went, the run's damage, and its best moments: the biggest week, the hero who dealt the most, and the
 * natural 20s.
 */

const props = defineProps<{ finale: SoloFinale; leagueId: string }>()

const won = computed(() => props.finale.outcome === 'won')
const fallen = computed(() => props.finale.chapters.filter(chapter => chapter.status === 'fallen').length)

const STATUS_TEXT = { upcoming: 'Never reached', active: 'Unfinished', fallen: 'Fallen', failed: 'Escaped' } as const

const heroText = (hero: SoloHeroRef) => (hero.player ? `${hero.name} · ${hero.player.name}` : hero.name)

function describe(award: SoloAward): { icon: string; title: string; subject: string; detail: string } {
  switch (award.kind) {
    case 'biggestWeek':
      return { icon: '⚔', title: 'Biggest Week', subject: `Week ${String(award.week)}`, detail: `Your party dealt ${damageText(award.damage)}` }
    case 'topHero':
      return { icon: '★', title: 'Hero of the Run', subject: heroText(award.hero), detail: `Dealt the most damage: ${damageText(award.damage)}` }
    case 'natural20':
      return {
        icon: '20',
        title: 'Natural 20s',
        subject: `${String(award.count)} rolled`,
        detail: `${heroText(award.hero)} rolled the most`
      }
  }
}
</script>

<template>
  <section class="outcome" :class="finale.outcome" aria-label="The run's outcome">
    <span class="mark" aria-hidden="true">{{ won ? '♛' : '☠' }}</span>
    <h1 class="headline">{{ won ? 'Victory!' : finale.abandoned ? 'Abandoned' : 'Defeat' }}</h1>
    <p class="line">
      <template v-if="won">Your party brought down the boss.</template>
      <template v-else-if="finale.abandoned">The run was abandoned, which counts as a loss. {{ fallen }} of {{ finale.chapters.length }} fell.</template>
      <template v-else>The monsters prevailed. {{ fallen }} of {{ finale.chapters.length }} fell.</template>
    </p>
    <p class="muted small">
      {{ livesText(finale.livesLeft, finale.lives) }} · {{ damageText(finale.total) }} damage in {{ finale.weeksPlayed }}
      {{ finale.weeksPlayed === 1 ? 'week' : 'weeks' }}
    </p>
  </section>

  <h2 class="section-title">The campaign</h2>
  <ol class="chapters">
    <li v-for="chapter in finale.chapters" :key="chapter.chapter" class="chapter" :class="chapter.status">
      <span class="chapter-status small">{{ STATUS_TEXT[chapter.status] }}</span>
      <span class="chapter-name">
        {{ chapter.name }}
        <span class="muted small">{{ chapterTitle(chapter, finale.chapters.length) }}</span>
      </span>
      <span class="num small">
        <template v-if="chapter.status === 'fallen'">Week {{ chapter.endedWeek }}</template>
        <template v-else-if="chapter.status === 'upcoming'">{{ chapter.hp.toLocaleString() }} HP</template>
        <template v-else>{{ hpShown(chapter.hpLeft).toLocaleString() }} HP left</template>
      </span>
    </li>
  </ol>

  <template v-if="finale.awards.length">
    <h2 class="section-title">The run's best moments</h2>
    <ul class="awards">
      <li v-for="award in finale.awards" :key="award.kind" class="card award">
        <span class="award-icon" aria-hidden="true">{{ describe(award).icon }}</span>
        <span class="award-text">
          <span class="award-title">{{ describe(award).title }}</span>
          <span class="award-subject">{{ describe(award).subject }}</span>
          <span class="muted small">{{ describe(award).detail }}</span>
        </span>
      </li>
    </ul>
  </template>

  <nav class="links">
    <RouterLink :to="`/leagues/${leagueId}/quest`">Every week ›</RouterLink>
    <RouterLink to="/solo/new">Start a new run ›</RouterLink>
  </nav>
</template>

<style scoped>
.small {
  font-size: 13px;
}
.outcome {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.outcome.won {
  border-color: var(--gold);
  background:
    radial-gradient(110% 80% at 50% 0%, color-mix(in srgb, var(--gold) 22%, transparent), transparent 70%),
    var(--surface);
}
.mark {
  font-size: 44px;
  color: var(--danger);
}
.won .mark {
  color: var(--gold);
}
.headline {
  font-size: 34px;
  line-height: 1.05;
}
.line {
  margin: 0;
  font-weight: 700;
}
.won .line {
  color: var(--gold);
}
.section-title {
  margin: 20px 0 8px;
  font-size: 22px;
}
.chapters,
.awards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chapter {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.chapter-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.chapter-status {
  font-weight: 700;
  color: var(--text-muted);
}
.chapter.fallen .chapter-status {
  color: var(--gold);
}
.chapter.failed,
.chapter.upcoming {
  opacity: 0.7;
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.award {
  display: flex;
  align-items: center;
  gap: 12px;
}
.award-icon {
  flex: none;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--gold);
  border-radius: 50%;
  color: var(--gold);
  font-size: 18px;
}
.award-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.award-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gold);
}
.award-subject {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 19px;
  overflow-wrap: anywhere;
}
.links {
  margin-top: 16px;
  display: flex;
  gap: 16px;
}
</style>
