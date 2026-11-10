import { Conflict } from '../../lib/errors.js'
import type { AccountDocument } from '../accounts/account.model.js'
import { HeroModel } from '../heroes/hero.model.js'
import { loadVisibleLeague } from '../leagues/league.access.js'
import { DEFAULT_CREST, toCrest, type Crest } from '../leagues/crests.js'
import type { LeagueDocument } from '../leagues/league.model.js'
import { PartyModel } from '../leagues/party.model.js'
import { getRuleset } from '../scoring/rulesets.js'
import { readMonsters, startCampaign, type CampaignOutcome, type CampaignState } from './campaign.js'
import { critOf } from './crits.js'
import { foughtLine, nextWeek } from './season.service.js'
import { WeekResultModel } from './weekResult.model.js'

/*
 * Co-op's quest board and finale (docs/COOP_SPEC.md, "Parties and contribution"). There are no standings: parties are
 * listed by the damage they dealt, highest first, as a friendly ranking of who helped most. Party totals are exact;
 * nothing here names a hero's player or the hidden season.
 */

export interface PartyRef {
  partyId: string
  name: string
  crest: Crest
}

export interface ChapterView {
  chapter: number
  name: string
  weak: string[]
  resists: string
  boss: boolean
  hp: number
  /** The last game week its monster may fall by */
  deadline: number
  status: 'upcoming' | 'active' | 'fallen' | 'failed'
  /** HP left: the full HP until it's fought, 0 once fallen */
  hpLeft: number
  /** The game week it fell, or when its deadline passed */
  endedWeek: number | null
}

export interface CampaignView {
  lives: number
  livesLeft: number
  outcome: CampaignOutcome
  /** The chapter being fought (the last one fought, once the campaign is over) */
  chapter: number
  chapters: ChapterView[]
  /** The last game week played, or null before week 1 */
  lastWeek: number | null
  /** The next game week while the campaign runs */
  nextWeek: { week: number; at: Date } | null
  /** Every party, by damage dealt to the current chapter's monster (most first) */
  contributions: (PartyRef & { lastWeek: number; chapter: number; total: number })[]
  /** The viewer's party, if they're in the league: hasChampion false means the board reminds them to name one */
  myParty: { partyId: string; hasChampion: boolean } | null
}

/** A Co-op league's campaign: for members, or anyone if the league is public. */
export async function getCampaign(viewer: AccountDocument, leagueId: string): Promise<CampaignView> {
  return campaignView(viewer, await loadVisibleLeague(viewer, leagueId))
}

/** The campaign view for a league the viewer has already been allowed to see. */
async function campaignView(viewer: AccountDocument, league: LeagueDocument): Promise<CampaignView> {
  const { rules, monsters } = campaignOf(league)
  const [results, refs, mine] = await Promise.all([
    WeekResultModel.find({ leagueId: league._id }).sort({ week: 1 }),
    partyRefs(league),
    PartyModel.findOne({ leagueId: league._id, accountId: viewer._id }, 'champion')
  ])
  const last = results.at(-1)
  const state: CampaignState = last?.campaign ? plainState(last.campaign.state) : startCampaign(monsters, rules)

  // Each chapter's end: the week it fell, or the week its deadline passed.
  const fell = new Map<number, number>()
  const failed = new Map<number, { week: number; hpLeft: number }>()
  for (const result of results) {
    for (const chapter of result.campaign?.fallen ?? []) fell.set(chapter, result.week)
    if (result.campaign?.failed) failed.set(result.campaign.failed, { week: result.week, hpLeft: result.campaign.failedHpLeft ?? 0 })
  }
  const chapters = monsters.map((monster, index): ChapterView => {
    const chapter = index + 1
    const status = fell.has(chapter) ? 'fallen' : failed.has(chapter) ? 'failed' : chapter === state.chapter ? 'active' : 'upcoming'
    return {
      chapter,
      name: monster.name,
      weak: [...monster.weak],
      resists: monster.resists,
      boss: monster.boss,
      hp: monster.hp,
      deadline: monster.deadline,
      status,
      hpLeft: status === 'fallen' ? 0 : status === 'failed' ? (failed.get(chapter)?.hpLeft ?? 0) : status === 'active' ? state.hpLeft : monster.hp,
      endedWeek: fell.get(chapter) ?? failed.get(chapter)?.week ?? null
    }
  })

  const lastTotals = new Map((last?.sides ?? []).map(side => [side.partyId.toString(), side.total]))
  const chapterTotals = new Map<string, number>()
  for (const result of results) {
    if (result.campaign?.chapter !== state.chapter) continue
    for (const side of result.sides ?? []) chapterTotals.set(side.partyId.toString(), add(chapterTotals.get(side.partyId.toString()), side.total))
  }
  const seasonTotals = totalsByParty(results)
  const contributions = [...refs.values()]
    .map(ref => ({ ...ref, lastWeek: lastTotals.get(ref.partyId) ?? 0, chapter: chapterTotals.get(ref.partyId) ?? 0, total: seasonTotals.get(ref.partyId) ?? 0 }))
    .sort((a, b) => b.chapter - a.chapter || b.total - a.total || a.name.localeCompare(b.name))

  return {
    lives: rules.lives,
    livesLeft: state.livesLeft,
    outcome: state.outcome,
    chapter: state.chapter,
    chapters,
    lastWeek: last?.week ?? null,
    nextWeek: state.outcome === 'ongoing' ? nextWeek(league) : null,
    contributions,
    myParty: mine ? { partyId: mine.id, hasChampion: !!mine.champion } : null
  }
}

export type CoopAward =
  /** The party that dealt the most damage over the campaign */
  | { kind: 'monsterSlayer'; party: PartyRef; damage: number }
  /** The party that dealt the most damage in the week a monster fell */
  | { kind: 'finalBlow'; chapter: number; monster: string; week: number; party: PartyRef; damage: number }
  /** The most natural 20s (critical successes) */
  | { kind: 'natural20'; party: PartyRef; count: number }
  /** The most natural 1s (critical fails) */
  | { kind: 'cursedDice'; party: PartyRef; count: number }

export interface CoopFinaleView {
  mode: 'coop'
  outcome: Exclude<CampaignOutcome, 'ongoing'>
  lives: number
  livesLeft: number
  chapters: ChapterView[]
  /** Every party's damage over the campaign, most first */
  contributions: (PartyRef & { total: number })[]
  myParty: { partyId: string } | null
  awards: CoopAward[]
}

/** The end of a Co-op campaign: victory or defeat, every chapter's result, and the awards. */
export async function getCoopFinale(viewer: AccountDocument, league: LeagueDocument): Promise<CoopFinaleView> {
  const { rules } = campaignOf(league)
  const campaign = await campaignView(viewer, league)
  if (campaign.outcome === 'ongoing') throw new Conflict("The campaign isn't over yet")
  const [results, refs, heroes] = await Promise.all([
    WeekResultModel.find({ leagueId: league._id }).sort({ week: 1 }),
    partyRefs(league),
    HeroModel.find({ leagueId: league._id }, 'heroClass')
  ])
  const ref = (id: string): PartyRef => refs.get(id) ?? { partyId: id, name: 'Unknown', crest: DEFAULT_CREST }
  const totals = totalsByParty(results)
  const contributions = [...refs.values()]
    .map(party => ({ ...party, total: totals.get(party.partyId) ?? 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))

  const awards: CoopAward[] = []
  const slayer = contributions[0]
  if (slayer && slayer.total > 0) awards.push({ kind: 'monsterSlayer', party: ref(slayer.partyId), damage: slayer.total })
  for (const result of results) {
    const best = [...(result.sides ?? [])].sort((a, b) => b.total - a.total)[0]
    if (!best || !result.campaign) continue
    for (const chapter of result.campaign.fallen) {
      const monster = campaign.chapters[chapter - 1]
      awards.push({ kind: 'finalBlow', chapter, monster: monster?.name ?? '', week: result.week, party: ref(best.partyId.toString()), damage: best.total })
    }
  }

  const ruleset = getRuleset(league.rulesetVersion)
  const classOf = new Map(heroes.map(hero => [hero.id, hero.heroClass]))
  const crits = { success: new Map<string, number>(), fail: new Map<string, number>() }
  for (const result of results) {
    for (const side of result.sides ?? []) {
      for (const line of side.heroes) {
        const crit = critOf(foughtLine(line, false), classOf.get(line.heroId.toString()) ?? 'Mage', ruleset)
        if (crit) crits[crit].set(side.partyId.toString(), (crits[crit].get(side.partyId.toString()) ?? 0) + 1)
      }
    }
  }
  /** The party with the most of one crit; ties go to the party that dealt more damage. */
  const most = (counts: ReadonlyMap<string, number>) =>
    contributions.reduce<{ partyId: string; count: number } | null>((best, row) => {
      const count = counts.get(row.partyId) ?? 0
      return count > (best?.count ?? 0) ? { partyId: row.partyId, count } : best
    }, null)
  const luckiest = most(crits.success)
  const cursed = most(crits.fail)
  if (luckiest) awards.push({ kind: 'natural20', party: ref(luckiest.partyId), count: luckiest.count })
  if (cursed) awards.push({ kind: 'cursedDice', party: ref(cursed.partyId), count: cursed.count })

  return {
    mode: 'coop',
    outcome: campaign.outcome,
    lives: rules.lives,
    livesLeft: campaign.livesLeft,
    chapters: campaign.chapters,
    contributions,
    myParty: campaign.myParty ? { partyId: campaign.myParty.partyId } : null,
    awards
  }
}

function campaignOf(league: LeagueDocument) {
  const rules = getRuleset(league.rulesetVersion).coop
  if (!rules) throw new Conflict('Only Co-op leagues have a campaign')
  const monsters = readMonsters(league.campaign)
  if (monsters.length === 0) throw new Conflict('The campaign begins once the draft has run')
  return { rules, monsters }
}

const plainState = (state: CampaignState): CampaignState => ({
  chapter: state.chapter,
  hpLeft: state.hpLeft,
  livesLeft: state.livesLeft,
  outcome: state.outcome
})

/** Adds party totals in hundredths, so they stay exact. */
const add = (sum: number | undefined, value: number) => Math.round(((sum ?? 0) + value) * 100) / 100

function totalsByParty(results: readonly { sides?: readonly { partyId: { toString(): string }; total: number }[] | null }[]) {
  const totals = new Map<string, number>()
  for (const result of results) {
    for (const side of result.sides ?? []) totals.set(side.partyId.toString(), add(totals.get(side.partyId.toString()), side.total))
  }
  return totals
}

async function partyRefs(league: LeagueDocument): Promise<Map<string, PartyRef>> {
  const parties = await PartyModel.find({ leagueId: league._id }, 'name crest')
  return new Map(parties.map(party => [party.id, { partyId: party.id, name: party.name, crest: toCrest(party.crest) }]))
}
