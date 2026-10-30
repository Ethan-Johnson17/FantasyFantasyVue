import mongoose from 'mongoose'
import { BadRequest, Conflict } from '../../lib/errors.js'
import { createRng, newSeed } from '../../lib/random.js'
import type { AccountDocument } from '../accounts/account.model.js'
import { HERO_CLASSES } from '../heroes/classes.js'
import { generateAppearances } from '../heroes/generator.js'
import { HeroModel, type HeroDocument } from '../heroes/hero.model.js'
import { autoLineup, autoQuestParty } from '../heroes/lineup.js'
import { expectedLevel, selectHeroPool, type HeroTrait, type LevelRange } from '../heroes/pool.js'
import { inTransaction, loadLeagueAsHost, loadLeagueAsMember, loadVisibleLeague } from '../leagues/league.access.js'
import { CADENCE_MS, LeagueModel } from '../leagues/league.model.js'
import { PartyModel, storedLineup } from '../leagues/party.model.js'
import { getRuleset } from '../scoring/rulesets.js'
import { heroForm, type HeroForm } from '../season/form.service.js'
import { crossoverWeeks, crossoverWindow } from '../season/nflWeeks.js'
import { roundRobin } from '../season/schedule.js'
import { loadPoolCandidates, pickSeason } from './candidates.js'
import { loadCrossoverCandidates, type PlayerCard } from './crossoverCandidates.js'
import { buildDynastyPool, dynastyDraftOptions, isLaterDynastySeason } from '../dynasty/dynasty.service.js'
import { xpView, type XpView } from '../dynasty/xp.js'
import { DraftRankingModel } from './ranking.model.js'
import { runSnakeDraft } from './snakeDraft.js'

/*
 * Draft lifecycle: schedule (builds the hidden hero pool), rank, and the automatic draft.
 * Rules: docs/CLASSIC_SCORING.md, "Season setup and draft".
 */

const { trusted } = mongoose

export const MIN_DRAFT_LEAD_MS = 10 * 60 * 1000
export const MAX_DRAFT_LEAD_MS = 14 * 24 * 60 * 60 * 1000

export interface HeroView {
  id: string
  name: string
  heroClass: string
  race: string
  gender: string
  weapon: string
  skill: string
  attack: number
  defense: number
  magic: number
  /** Null for mystery recruits */
  level: number | null
  /** Shown for mystery recruits */
  levelRange: LevelRange | null
  traits: HeroTrait[]
  /** The party that drafted the hero, if any */
  partyId: string | null
  /** Crossover only: the real player. Never present in Classic, whose players stay hidden. */
  player?: PlayerCard
  /** Dynasty only: XP carried into this season and its bonus, for heroes who have some */
  xp?: XpView
  /** Dynasty only: the trait earned at the top XP tier (also in `traits` unless it conflicts) */
  earnedTrait?: HeroTrait
}

export async function scheduleDraft(host: AccountDocument, leagueId: string, draftAt: Date): Promise<void> {
  const league = await loadLeagueAsHost(host, leagueId)
  const now = Date.now()
  if (draftAt.getTime() < now + MIN_DRAFT_LEAD_MS || draftAt.getTime() > now + MAX_DRAFT_LEAD_MS) {
    throw new BadRequest('The draft must be between 10 minutes and 14 days from now')
  }

  // Crossover drafts need enough of the real NFL season left after them.
  const window = league.mode === 'crossover' ? await crossoverWindow(draftAt) : null

  if (league.status === 'drafting') {
    const rescheduled = await LeagueModel.updateOne(
      { _id: league._id, status: 'drafting', draftAt: trusted({ $gt: new Date(now) }) },
      { $set: { draftAt } }
    )
    if (rescheduled.modifiedCount === 0) throw new Conflict('The draft has already started')
    return
  }
  if (league.status !== 'forming') throw new Conflict('The draft can only be scheduled while the league is forming')
  if (league.partyCount < 2) throw new Conflict('At least 2 parties are needed to schedule the draft')

  // Build the pool outside the transaction (read-heavy), then claim the league and save it atomically.
  const seed = newSeed()
  const ruleset = getRuleset(league.rulesetVersion)
  // Classic: a hidden past season and its unnamed players. Crossover: the season being played, shown openly.
  // Dynasty: the first season is drawn so the whole chain fits; later seasons were set when the season opened.
  const laterDynasty = isLaterDynastySeason(league)
  const stored = laterDynasty ? (await LeagueModel.findById(league._id).select('+season'))?.season : null
  const season = window
    ? window.season
    : laterDynasty && stored
      ? stored
      : await pickSeason(createRng(seed, 'season'), league.dynasty?.seasons ?? 1)
  let pool: (Awaited<ReturnType<typeof buildDynastyPool>>['draftable'][number])[]
  let cards = new Map<string, PlayerCard>()
  let kept: Record<string, unknown>[] = []
  if (window) {
    const loaded = await loadCrossoverCandidates(season, ruleset)
    cards = loaded.cards
    pool = generateAppearances(selectHeroPool(loaded.candidates, league.partyCount, ruleset.pool), createRng(seed, 'pool'))
  } else if (laterDynasty) {
    // Kept heroes carry over into their party; everyone else is in the pool.
    ;({ draftable: pool, kept } = await buildDynastyPool(league, season, ruleset, createRng(seed, 'pool')))
  } else {
    pool = generateAppearances(selectHeroPool(await loadPoolCandidates(season, ruleset), league.partyCount, ruleset.pool), createRng(seed, 'pool'))
  }

  await inTransaction(async session => {
    // Matching partyCount guarantees nobody joined or left while the pool was being built.
    const claimed = await LeagueModel.updateOne(
      { _id: league._id, status: 'forming', partyCount: league.partyCount },
      // Open dynasty parties nobody took over leave the league now; their keepers return to the pool.
      { $set: { status: 'drafting', draftAt, season, seed, openParties: [] } },
      { session }
    )
    if (claimed.modifiedCount === 0) throw new Conflict('The league changed while scheduling; please try again')
    await HeroModel.insertMany(
      pool.map(({ sourceKind, sourceId, ...hero }) => ({
        ...hero,
        leagueId: league._id,
        source: { kind: sourceKind, id: sourceId },
        player: cards.get(sourceId) ?? null
      })),
      { session }
    )
    if (kept.length) await HeroModel.insertMany(kept, { session })
  })
}

/** Runs the draft if it is due. Safe to call often and concurrently: only one caller runs it. */
export async function runDueDraft(leagueId: string): Promise<void> {
  const due = { _id: leagueId, status: 'drafting' as const, draftAt: trusted({ $lte: new Date() }) }
  if (!(await LeagueModel.exists(due))) return

  await inTransaction(async session => {
    const league = await LeagueModel.findOneAndUpdate(due, { $set: { status: 'active' } }, { session }).select('+seed')
    if (!league?.seed || !league.draftAt) return // Another request already ran it.

    const [parties, rankings, heroes] = await Promise.all([
      PartyModel.find({ leagueId: league._id }).session(session),
      DraftRankingModel.find({ leagueId: league._id }).session(session),
      HeroModel.find({ leagueId: league._id }).session(session)
    ])
    const rankingByParty = new Map(rankings.map(ranking => [ranking.partyId.toString(), ranking.heroIds.map(String)]))
    // Dynasty: kept heroes are already in their parties and fill their first picks, in last season's reverse order.
    const options = isLaterDynastySeason(league) ? await dynastyDraftOptions(league, parties, heroes) : {}
    const { order, picks } = runSnakeDraft(
      parties.map(party => ({ id: party.id, ranking: rankingByParty.get(party.id) ?? [] })),
      heroes.filter(hero => !hero.partyId).map(hero => ({ id: hero.id, heroClass: hero.heroClass, value: expectedLevel(hero) })),
      createRng(league.seed, 'draft'),
      getRuleset(league.rulesetVersion).lineup,
      options
    )

    await HeroModel.bulkWrite(
      picks.map(pick => ({ updateOne: { filter: { _id: pick.heroId }, update: { $set: { partyId: pick.partyId } } } })),
      { session }
    )
    const heroById = new Map(heroes.map(hero => [hero.id, hero]))
    await PartyModel.bulkWrite(
      parties.map(party => {
        const roster = picks
          .filter(pick => pick.partyId === party.id)
          .flatMap(pick => {
            const hero = heroById.get(pick.heroId)
            return hero ? [{ id: hero.id, heroClass: hero.heroClass, value: expectedLevel(hero) }] : []
          })
        const ruleset = getRuleset(league.rulesetVersion)
        const lineup = storedLineup(autoLineup(roster, ruleset.lineup.slots))
        // Crossover: the highest-Level heroes form the first Quest party.
        const questParty = ruleset.quest ? autoQuestParty(roster, ruleset.quest.partySize) : undefined
        return { updateOne: { filter: { _id: party._id }, update: { $set: { lineup, ...(questParty ? { questParty } : {}) } } } }
      }),
      { session }
    )
    // Crossover follows the NFL: game week 1 is the first NFL week starting after the draft time, through week 17.
    if (league.mode === 'crossover') {
      const { season, firstWeek } = await crossoverWindow(league.draftAt)
      const nflWeeks = await crossoverWeeks(season, firstWeek)
      await LeagueModel.updateOne(
        { _id: league._id },
        {
          $set: {
            draftOrder: order,
            draftPicks: picks,
            nflWeeks,
            schedule: roundRobin(parties.map(party => party.id), createRng(league.seed, 'schedule'), nflWeeks.length),
            weekOneAt: nflWeeks[0]?.finalAt
          }
        },
        { session }
      )
      return
    }
    await LeagueModel.updateOne(
      { _id: league._id },
      {
        $set: {
          draftOrder: order,
          draftPicks: picks,
          schedule: roundRobin(
            parties.map(party => party.id),
            createRng(league.seed, 'schedule')
          ),
          weekOneAt: new Date(league.draftAt.getTime() + CADENCE_MS[league.cadence])
        }
      },
      { session }
    )
  })
}

/** The league's whole hero pool, with each hero's recent form once battles have been played. */
export async function listHeroes(viewer: AccountDocument, leagueId: string): Promise<(HeroView & { form: HeroForm })[]> {
  const league = await loadVisibleLeague(viewer, leagueId)
  const heroes = await HeroModel.find({ leagueId: league._id }).select('+source')
  const form = await heroForm(league, heroes)
  const classOrder = (hero: HeroDocument) => HERO_CLASSES.indexOf(hero.heroClass)
  return heroes
    .sort((a, b) => classOrder(a) - classOrder(b) || expectedLevel(b) - expectedLevel(a) || a.name.localeCompare(b.name))
    .map(hero => ({ ...toHeroView(hero), form: form.get(hero.id) ?? { average: null, recent: null, played: 0, playingLike: null, projected: 0 } }))
}

export async function getRankings(member: AccountDocument, leagueId: string): Promise<{ heroIds: string[] }> {
  const { party } = await loadLeagueAsMember(member, leagueId)
  const ranking = await DraftRankingModel.findOne({ partyId: party._id })
  return { heroIds: ranking?.heroIds.map(String) ?? [] }
}

export async function setRankings(
  member: AccountDocument,
  leagueId: string,
  heroIds: readonly string[]
): Promise<{ heroIds: string[] }> {
  const { league, party } = await loadLeagueAsMember(member, leagueId)
  if (league.status !== 'drafting') throw new Conflict('Rankings can only be changed before the draft runs')
  const inPool = await HeroModel.countDocuments({ leagueId: league._id, _id: trusted({ $in: heroIds }) })
  if (inPool !== heroIds.length) throw new BadRequest("Rankings may only include heroes from this league's pool")

  await DraftRankingModel.updateOne(
    { leagueId: league._id, partyId: party._id },
    { $set: { heroIds } },
    { upsert: true }
  )
  return { heroIds: [...heroIds] }
}

export function toHeroView(hero: HeroDocument): HeroView {
  return {
    id: hero.id,
    name: hero.name,
    heroClass: hero.heroClass,
    race: hero.race,
    gender: hero.gender,
    weapon: hero.weapon,
    skill: hero.skill,
    attack: hero.attack,
    defense: hero.defense,
    magic: hero.magic,
    level: hero.level ?? null,
    levelRange: hero.levelRange ? { min: hero.levelRange.min, max: hero.levelRange.max } : null,
    traits: [...hero.traits],
    partyId: hero.partyId?.toString() ?? null,
    ...(hero.player ? { player: { name: hero.player.name, team: hero.player.team, position: hero.player.position } } : {}),
    ...(hero.xp > 0 ? { xp: xpView(hero.xp) } : {}),
    ...(hero.earnedTrait ? { earnedTrait: hero.earnedTrait } : {})
  }
}
