import type { Campaign, CampaignChapter, WeekResult } from './api/types'

/* Co-op's campaign as players read it (docs/COOP_SPEC.md): HP, deadlines, lives and what each week did. */

/** HP as shown: rounded up, so a monster with any HP left never reads as 0 */
export const hpShown = (hp: number): number => Math.max(0, Math.ceil(hp))

/** Whole damage, with thousands separators */
export const damageText = (value: number): string => Math.round(value).toLocaleString()

/** The share of a monster's HP left, 0-100 */
export const hpPercent = (left: number, max: number): number => (max > 0 ? Math.min(100, Math.max(0, (left / max) * 100)) : 0)

export const chapterTitle = (chapter: Pick<CampaignChapter, 'chapter' | 'boss'>, chapters: number): string =>
  chapter.boss ? 'The boss raid' : `Chapter ${String(chapter.chapter)} of ${String(chapters)}`

/** The chapter being fought, or the last one fought once the campaign is over */
export const currentChapter = (campaign: Campaign): CampaignChapter | null => campaign.chapters[campaign.chapter - 1] ?? null

/** How long the league has left to bring the current monster down, counting the next battle */
export function deadlineText(chapter: CampaignChapter, nextWeek: number | null): string {
  if (nextWeek === null) return `Had to fall by week ${String(chapter.deadline)}`
  const weeks = chapter.deadline - nextWeek + 1
  if (weeks <= 1) return `Week ${String(chapter.deadline)} is the last chance to bring it down`
  return `Must fall by week ${String(chapter.deadline)} · ${String(weeks)} battles left`
}

export const livesText = (left: number, total: number): string => `${String(left)} of ${String(total)} ${total === 1 ? 'life' : 'lives'} left`

/** What a played week did to the campaign, in a sentence. Solo: one party's run. */
export function weekStory(result: WeekResult, chapters: readonly CampaignChapter[], solo = false): string {
  const campaign = result.campaign
  if (!campaign) return ''
  const name = (chapter: number) => chapters[chapter - 1]?.name ?? 'The monster'
  const parts = [`${solo ? 'Your party' : 'The league'} dealt ${damageText(campaign.dealt)} damage to ${campaign.monster}.`]
  for (const [index, chapter] of campaign.fallen.entries()) {
    parts.push(index === 0 ? `${name(chapter)} fell!` : `The overkill brought down ${name(chapter)} too!`)
  }
  if (campaign.failed !== null) {
    parts.push(`${name(campaign.failed)} outlasted its deadline${campaign.state.outcome === 'lost' ? '.' : ': a life was lost, and the story moves on.'}`)
  }
  if (campaign.state.outcome === 'won') parts.push(solo ? 'The run is won!' : 'The campaign is won!')
  else if (campaign.state.outcome === 'lost') parts.push(solo ? 'The run is lost.' : 'The campaign is lost.')
  return parts.join(' ')
}
