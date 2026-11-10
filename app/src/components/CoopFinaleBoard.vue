<script setup lang="ts">
import { computed } from 'vue'
import type { CoopAward, CoopFinale } from '../api/types'
import { chapterTitle, damageText, hpShown, livesText } from '../campaign'
import CrestShield from './CrestShield.vue'

/*
 * The end of a Co-op campaign (docs/COOP_SPEC.md): won or lost together, how each chapter went, who dealt the most
 * damage, and the awards. The ranking is friendly: every party shares the outcome.
 */

const props = defineProps<{ finale: CoopFinale; leagueId: string; draft: boolean }>()

const won = computed(() => props.finale.outcome === 'won')
const fallen = computed(() => props.finale.chapters.filter(chapter => chapter.status === 'fallen').length)
const isMine = (partyId: string) => partyId === props.finale.myParty?.partyId

const STATUS_TEXT = { upcoming: 'Never reached', active: 'Unfinished', fallen: 'Fallen', failed: 'Escaped' } as const

function describe(award: CoopAward): { icon: string; title: string; subject: string; detail: string } {
  switch (award.kind) {
    case 'monsterSlayer':
      return { icon: '⚔', title: 'Monster Slayer', subject: award.party.name, detail: `Dealt the most damage: ${damageText(award.damage)}` }
    case 'finalBlow':
      return {
        icon: '☠',
        title: 'Final Blow',
        subject: award.party.name,
        detail: `Brought down ${award.monster} in week ${String(award.week)} with ${damageText(award.damage)}`
      }
    case 'natural20':
      return { icon: '20', title: 'Natural 20', subject: award.party.name, detail: `Rolled the most natural 20s: ${String(award.count)}` }
    case 'cursedDice':
      return { icon: '1', title: 'Cursed Dice', subject: award.party.name, detail: `Rolled the most natural 1s: ${String(award.count)}` }
  }
}
const awardKey = (award: CoopAward) => (award.kind === 'finalBlow' ? `finalBlow-${String(award.chapter)}` : award.kind)
</script>

<template>
  <section class="outcome" :class="finale.outcome" aria-label="The campaign's outcome">
    <span class="mark" aria-hidden="true">{{ won ? '♛' : '☠' }}</span>
    <h1 class="headline">{{ won ? 'Victory!' : 'Defeat' }}</h1>
    <p class="line">
      <template v-if="won">The league brought down the boss together.</template>
      <template v-else>The monsters prevailed. {{ fallen }} of {{ finale.chapters.length }} fell.</template>
    </p>
    <p class="muted small">{{ livesText(finale.livesLeft, finale.lives) }}</p>
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

  <h2 class="section-title">Awards</h2>
  <ul class="awards">
    <li v-for="award in finale.awards" :key="awardKey(award)" class="card award">
      <span class="award-icon" aria-hidden="true">{{ describe(award).icon }}</span>
      <span class="award-text">
        <span class="award-title">{{ describe(award).title }}</span>
        <span class="award-subject">{{ describe(award).subject }}</span>
        <span class="muted small">{{ describe(award).detail }}</span>
      </span>
    </li>
  </ul>

  <h2 class="section-title">Who dealt the damage</h2>
  <ol class="helpers">
    <li v-for="row in finale.contributions" :key="row.partyId" class="helper" :class="{ mine: isMine(row.partyId) }">
      <CrestShield :crest="row.crest" :size="22" decorative />
      <span class="helper-name">{{ row.name }} <span v-if="isMine(row.partyId)" class="you">you</span></span>
      <span class="num">{{ damageText(row.total) }}</span>
    </li>
  </ol>

  <nav class="links">
    <RouterLink :to="`/leagues/${leagueId}/quest`">Every battle ›</RouterLink>
    <RouterLink v-if="draft" :to="`/leagues/${leagueId}/draft`">The draft ›</RouterLink>
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
.awards,
.helpers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chapter,
.helper {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.helper {
  grid-template-columns: auto 1fr auto;
}
.helper.mine {
  border-color: var(--gold);
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
.helper-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.you {
  color: var(--gold);
  font-size: 12px;
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
