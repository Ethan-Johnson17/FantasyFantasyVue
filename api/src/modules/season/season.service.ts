import mongoose, { type ClientSession } from 'mongoose'
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js'
import { createRng } from '../../lib/random.js'
import type { AccountDocument } from '../accounts/account.model.js'
import { toHeroView, type HeroView } from '../draft/draft.service.js'
import type { HeroClass } from '../heroes/classes.js'
import { HeroModel, type HeroDocument } from '../heroes/hero.model.js'
import { planAutoSwaps, validateLineup, type Lineup } from '../heroes/lineup.js'
import { expectedLevel } from '../heroes/pool.js'
import { inTransaction, loadLeagueAsMember, loadVisibleLeague } from '../leagues/league.access.js'
import { CADENCE_MS, LeagueModel, type LeagueDocument } from '../leagues/league.model.js'
import { DEFAULT_CREST, type Crest } from '../leagues/crests.js'
import { PartyModel, readLineup, storedLineup, type PartyDocument } from '../leagues/party.model.js'
import { getRuleset, type Ruleset, type SlotRule } from '../scoring/rulesets.js'
import { scoreDefense, scoreOffense } from '../scoring/scoring.js'
import { DefenseWeekStatModel, PlayerWeekStatModel } from '../stats/stats.models.js'
import { decideBattle, decideMonsterBattle, monsterDamage, scoreParty, type Outcome } from './battle.js'
import { monsterName } from './monsters.js'
import { SEASON_WEEKS } from './schedule.js'
import { WeekResultModel } from './weekResult.model.js'

/*
 * Season play: weekly resolution, lineups, schedule, results, and standings.
 * Rules: docs/CLASSIC_SCORING.md, "Season play".
 */

const { trusted } = mongoose

// ---------------------------------------------------------------------------
// Weekly resolution

/** Resolves every game week that is due, in order. Safe to call often and concurrently. */
export async function resolveDueWeeks(leagueId: string): Promise<void> {
  const league = await LeagueModel.findById(leagueId).select('+season +seed')
  if (league?.status !== 'active' || !league.weekOneAt) return
  const due = Math.min(
    SEASON_WEEKS,
    Math.floor((Date.now() - league.weekOneAt.getTime()) / CADENCE_MS[league.cadence]) + 1
  )
  for (let week = league.resolvedWeeks + 1; week <= due; week++) {
    if (!(await resolveWeek(league, week))) return // another request is resolving
  }
}

async function resolveWeek(league: LeagueDocument, week: number): Promise<boolean> {
  const { season, seed } = league
  const scheduled = league.schedule?.find(entry => entry.week === week)
  if (season === undefined || season === null || !seed || !scheduled) throw new Error(`League ${league.id} is missing season data`)

  return inTransaction(async session => {
    // Claim exactly this week; fails if another request already resolved it.
    const claim = await LeagueModel.updateOne(
      { _id: league._id, status: 'active', resolvedWeeks: week - 1 },
      { $set: { resolvedWeeks: week, ...(week === SEASON_WEEKS ? { status: 'complete' } : {}) } },
      { session }
    )
    if (claim.modifiedCount === 0) return false

    const [parties, heroes] = await Promise.all([
      PartyModel.find({ leagueId: league._id }).session(session),
      HeroModel.find({ leagueId: league._id, partyId: trusted({ $ne: null }) })
        .select('+source')
        .session(session)
    ])
    const ruleset = getRuleset(league.rulesetVersion)
    const points = await heroPoints(heroes, season, week, ruleset, session)
    const sides = new Map(parties.map(party => [party.id, buildSide(party, heroes, points, ruleset)]))
    const monsterTotal = monsterDamage([...sides.values()].map(side => side.total))

    const matchups = scheduled.matchups.map(matchup => {
      const home = sides.get(matchup.home.toString())
      if (!home) throw new Error(`Party ${matchup.home.toString()} not found`)
      if (!matchup.away) {
        const monster = { name: monsterName(createRng(seed, `monster-${String(week)}`)), total: monsterTotal }
        return { home, away: null, monster, outcome: decideMonsterBattle(home, monster.total) }
      }
      const away = sides.get(matchup.away.toString())
      if (!away) throw new Error(`Party ${matchup.away.toString()} not found`)
      return { home, away, monster: null, outcome: decideBattle(home, away) }
    })
    await WeekResultModel.create([{ leagueId: league._id, week, matchups }], { session })
    return true
  })
}

interface HeroPoints {
  points: number
  resting: boolean
}

/** Each drafted hero's exact points for an NFL week; heroes without a stat line are resting. */
async function heroPoints(
  heroes: readonly HeroDocument[],
  season: number,
  week: number,
  ruleset: Ruleset,
  session: ClientSession | null = null
): Promise<Map<string, HeroPoints>> {
  const playerIds = heroes.filter(hero => hero.source.kind === 'player').map(hero => hero.source.id)
  const teams = heroes.filter(hero => hero.source.kind === 'defense').map(hero => hero.source.id)
  const [playerLines, defenseLines] = await Promise.all([
    PlayerWeekStatModel.find({ season, seasonType: 'REG', week, playerId: trusted({ $in: playerIds }) }).session(session),
    DefenseWeekStatModel.find({ season, seasonType: 'REG', week, team: trusted({ $in: teams }) }).session(session)
  ])
  const playerScores = new Map(playerLines.map(line => [line.playerId, scoreOffense(line.stats, ruleset)]))
  const defenseScores = new Map(defenseLines.map(line => [line.team, scoreDefense(line.stats, ruleset)]))

  return new Map(
    heroes.map(hero => {
      const scores = hero.source.kind === 'player' ? playerScores : defenseScores
      const score = scores.get(hero.source.id)
      return [hero.id, score === undefined ? { points: 0, resting: true } : { points: score, resting: false }]
    })
  )
}

function buildSide(
  party: PartyDocument,
  heroes: readonly HeroDocument[],
  points: ReadonlyMap<string, HeroPoints>,
  ruleset: Ruleset
) {
  const lineup = readLineup(party.lineup)
  if (!lineup) throw new Error(`Party ${party.id} has no lineup`)
  const { slots, classMultipliers, autoSwapMultiplier } = ruleset.lineup
  const slotByHero = new Map(Object.entries(lineup).map(([slot, heroId]) => [heroId, slot]))
  const roster = heroes.filter(hero => hero.partyId?.equals(party._id))
  const pointsOf = (id: string) => points.get(id) ?? { points: 0, resting: true }

  const swaps = party.autoSwap
    ? planAutoSwaps(
        lineup,
        slots,
        new Set(Object.values(lineup).filter(id => pointsOf(id).resting)),
        roster
          .filter(hero => !slotByHero.has(hero.id))
          .map(hero => ({ id: hero.id, heroClass: hero.heroClass, value: expectedLevel(hero), resting: pointsOf(hero.id).resting }))
      )
    : new Map<string, string>()
  const swappedInto = new Map([...swaps].map(([slot, heroId]) => [heroId, slot]))
  const round2 = (value: number) => Math.round(value * 100) / 100

  const lines = roster.map(hero => {
    const slot = slotByHero.get(hero.id) ?? 'Bench'
    const into = swappedInto.get(hero.id) ?? null
    const earned = pointsOf(hero.id)
    const damage = earned.points * classMultipliers[hero.heroClass]
    // Starters count their class damage, swapped-in bench heroes count it at the swap penalty, the rest count 0.
    const counted = slot !== 'Bench' ? round2(damage) : into ? round2(damage * autoSwapMultiplier) : 0
    return { heroId: hero._id, slot, ...earned, swappedInto: into, counted, benchDamage: round2(damage) }
  })
  const score = scoreParty(
    lines.filter(line => line.slot !== 'Bench' || line.swappedInto).map(line => line.counted),
    lines.filter(line => line.slot === 'Bench' && !line.swappedInto).map(line => line.benchDamage)
  )
  return {
    partyId: party._id,
    ...score,
    heroes: lines.map(({ benchDamage: _benchDamage, ...line }) => line)
  }
}

// ---------------------------------------------------------------------------
// Lineups

export interface LineupView {
  /** The league's starting slots, in display order */
  slots: SlotRule[]
  lineup: Lineup | null
  autoSwap: boolean
  roster: (HeroView & { restingNextWeek: boolean })[]
  /** The next game week to resolve, or null if the season is over or hasn't started */
  nextWeek: number | null
  nextWeekAt: Date | null
}

export async function getLineup(member: AccountDocument, leagueId: string): Promise<LineupView> {
  const { league, party } = await loadLeagueAsMember(member, leagueId)
  const roster = await HeroModel.find({ leagueId: league._id, partyId: party._id }).select('+source')
  const next = nextWeek(league)
  const resting = next ? await restingHeroes(league, roster, next.week) : new Set<string>()
  return {
    slots: getRuleset(league.rulesetVersion).lineup.slots.map(slot => ({ ...slot, classes: [...slot.classes] })),
    lineup: readLineup(party.lineup),
    autoSwap: party.autoSwap,
    roster: roster.map(hero => ({ ...toHeroView(hero), restingNextWeek: resting.has(hero.id) })),
    nextWeek: next?.week ?? null,
    nextWeekAt: next?.at ?? null
  }
}

export async function setLineup(member: AccountDocument, leagueId: string, lineup: Lineup): Promise<LineupView> {
  const { league, party } = await loadLeagueAsMember(member, leagueId)
  if (league.status !== 'active') throw new Conflict('Lineups can be set after the draft and until the season ends')

  const roster = new Map((await HeroModel.find({ leagueId: league._id, partyId: party._id })).map(hero => [hero.id, hero]))
  const problem = validateLineup(lineup, getRuleset(league.rulesetVersion).lineup.slots, id => roster.get(id)?.heroClass)
  if (problem) throw new BadRequest(problem)
  await PartyModel.updateOne({ _id: party._id }, { $set: { lineup: storedLineup(lineup) } })
  return getLineup(member, leagueId)
}

function nextWeek(league: LeagueDocument): { week: number; at: Date } | null {
  if (league.status !== 'active' || !league.weekOneAt) return null
  const week = league.resolvedWeeks + 1
  return { week, at: new Date(league.weekOneAt.getTime() + (week - 1) * CADENCE_MS[league.cadence]) }
}

async function restingHeroes(league: LeagueDocument, roster: readonly HeroDocument[], week: number): Promise<Set<string>> {
  const withSeason = await LeagueModel.findById(league._id).select('+season')
  const season = withSeason?.season
  if (season === undefined || season === null) return new Set()
  const ruleset = getRuleset(league.rulesetVersion)
  const points = await heroPoints(roster, season, week, ruleset)
  return new Set([...points].filter(([, value]) => value.resting).map(([id]) => id))
}

// ---------------------------------------------------------------------------
// Schedule, results, standings

interface PartyRef {
  partyId: string
  name: string
  crest: Crest
}

export interface ScheduleWeekView {
  week: number
  resolvesAt: Date | null
  matchups: {
    home: PartyRef
    /** null: the home party fights the dungeon monster */
    away: PartyRef | null
    result: { homeTotal: number; awayTotal: number; outcome: Outcome; monster: string | null } | null
  }[]
}

export async function getSchedule(viewer: AccountDocument, leagueId: string): Promise<ScheduleWeekView[]> {
  const league = await loadVisibleLeague(viewer, leagueId)
  if (!league.schedule) return []
  const [refs, results] = await Promise.all([partyRefs(league), WeekResultModel.find({ leagueId: league._id })])
  const resultByWeek = new Map(results.map(result => [result.week, result]))
  const ref = (id: { toString(): string }) => refs.get(id.toString()) ?? { partyId: id.toString(), name: 'Unknown', crest: DEFAULT_CREST }

  return league.schedule.map(scheduled => {
    const result = resultByWeek.get(scheduled.week)
    return {
      week: scheduled.week,
      resolvesAt: league.weekOneAt
        ? new Date(league.weekOneAt.getTime() + (scheduled.week - 1) * CADENCE_MS[league.cadence])
        : null,
      matchups: scheduled.matchups.map(matchup => {
        const played = result?.matchups.find(m => m.home.partyId.equals(matchup.home))
        return {
          home: ref(matchup.home),
          away: matchup.away ? ref(matchup.away) : null,
          result: played
            ? {
                homeTotal: played.home.total,
                awayTotal: played.away?.total ?? played.monster?.total ?? 0,
                outcome: played.outcome,
                monster: played.monster?.name ?? null
              }
            : null
        }
      })
    }
  })
}

interface SideView extends PartyRef {
  total: number
  heroes: {
    heroId: string
    name: string
    heroClass: string
    slot: string
    /** Rounded points that counted toward the party total */
    damage: number
    resting: boolean
    /** The slot a bench hero was auto-swapped into (scoring at a penalty), if any */
    swappedInto: string | null
  }[]
}

export interface WeekResultView {
  week: number
  matchups: { home: SideView; away: SideView | null; monster: { name: string; total: number } | null; outcome: Outcome }[]
}

export async function getWeekResult(viewer: AccountDocument, leagueId: string, week: number): Promise<WeekResultView> {
  const league = await loadVisibleLeague(viewer, leagueId)
  const result = await WeekResultModel.findOne({ leagueId: league._id, week })
  if (!result) throw new NotFound('That week has not been played yet')
  const [refs, heroes] = await Promise.all([partyRefs(league), HeroModel.find({ leagueId: league._id }, 'name heroClass')])
  const heroById = new Map(heroes.map(hero => [hero.id, hero]))
  const multipliers = getRuleset(league.rulesetVersion).lineup.classMultipliers

  const side = (stored: (typeof result.matchups)[number]['home']): SideView => ({
    ...(refs.get(stored.partyId.toString()) ?? { partyId: stored.partyId.toString(), name: 'Unknown', crest: DEFAULT_CREST }),
    total: stored.total,
    heroes: stored.heroes.map(line => ({
      heroId: line.heroId.toString(),
      name: heroById.get(line.heroId.toString())?.name ?? 'Unknown hero',
      heroClass: heroById.get(line.heroId.toString())?.heroClass ?? '',
      slot: line.slot,
      damage: displayedDamage(line, heroById.get(line.heroId.toString())?.heroClass ?? 'Mage', multipliers),
      resting: line.resting,
      swappedInto: line.swappedInto ?? null
    }))
  })

  return {
    week: result.week,
    matchups: result.matchups.map(matchup => ({
      home: side(matchup.home),
      away: matchup.away ? side(matchup.away) : null,
      monster: matchup.monster ? { name: matchup.monster.name, total: matchup.monster.total } : null,
      outcome: matchup.outcome
    }))
  }
}

export interface StandingView extends PartyRef {
  wins: number
  losses: number
  draws: number
  totalDamage: number
}

/** Ranked by win points (win 1, draw ½), then total damage. */
export async function getStandings(viewer: AccountDocument, leagueId: string): Promise<StandingView[]> {
  return computeStandings(await loadVisibleLeague(viewer, leagueId))
}

/** Standings for a league the caller has already been authorized to see. */
export async function computeStandings(league: LeagueDocument): Promise<StandingView[]> {
  const [refs, results] = await Promise.all([partyRefs(league), WeekResultModel.find({ leagueId: league._id })])
  const table = new Map([...refs.values()].map(ref => [ref.partyId, { ...ref, wins: 0, losses: 0, draws: 0, damage: 0 }]))

  const record = (partyId: string, total: number, result: 'win' | 'loss' | 'draw') => {
    const row = table.get(partyId)
    if (!row) return
    row.damage += Math.round(total * 100)
    if (result === 'win') row.wins++
    else if (result === 'loss') row.losses++
    else row.draws++
  }
  for (const result of results) {
    for (const matchup of result.matchups) {
      const homeResult = matchup.outcome === 'home' ? 'win' : matchup.outcome === 'away' ? 'loss' : 'draw'
      record(matchup.home.partyId.toString(), matchup.home.total, homeResult)
      if (matchup.away) {
        const awayResult = homeResult === 'win' ? 'loss' : homeResult === 'loss' ? 'win' : 'draw'
        record(matchup.away.partyId.toString(), matchup.away.total, awayResult)
      }
    }
  }
  const winPoints = (row: { wins: number; draws: number }) => row.wins + row.draws / 2
  return [...table.values()]
    .sort((a, b) => winPoints(b) - winPoints(a) || b.damage - a.damage)
    .map(({ damage, ...row }) => ({ ...row, totalDamage: damage / 100 }))
}

type StoredHeroLine = { slot: string; points: number; counted: number; swappedInto?: string | null }

/**
 * The damage players see for one hero-week. Hidden-player rule: rounded to a whole number so weekly
 * lines can't be matched to public stats. Bench heroes show what they would have dealt.
 */
function displayedDamage(line: StoredHeroLine, heroClass: HeroClass, multipliers: Readonly<Record<HeroClass, number>>): number {
  return Math.round(line.slot === 'Bench' && !line.swappedInto ? line.points * multipliers[heroClass] : line.counted)
}

export interface HeroDetailView {
  hero: HeroView
  history: { week: number; slot: string; damage: number; resting: boolean; swappedInto: string | null }[]
}

/** A hero and its week-by-week damage (rounded), for members or anyone in a public league. */
export async function getHeroDetail(viewer: AccountDocument, leagueId: string, heroId: string): Promise<HeroDetailView> {
  const league = await loadVisibleLeague(viewer, leagueId)
  const hero = await HeroModel.findOne({ _id: heroId, leagueId: league._id })
  if (!hero) throw new NotFound()
  const multipliers = getRuleset(league.rulesetVersion).lineup.classMultipliers
  const results = await WeekResultModel.find({ leagueId: league._id }).sort({ week: 1 })
  const history = results.flatMap(result => {
    const line = result.matchups
      .flatMap(matchup => (matchup.away ? [matchup.home, matchup.away] : [matchup.home]))
      .flatMap(side => side.heroes)
      .find(entry => entry.heroId.equals(hero._id))
    if (!line) return []
    return [
      {
        week: result.week,
        slot: line.slot,
        damage: displayedDamage(line, hero.heroClass, multipliers),
        resting: line.resting,
        swappedInto: line.swappedInto ?? null
      }
    ]
  })
  return { hero: toHeroView(hero), history }
}

async function partyRefs(league: LeagueDocument): Promise<Map<string, PartyRef>> {
  const parties = await PartyModel.find({ leagueId: league._id }, 'name crest')
  return new Map(
    parties.map(party => [
      party.id,
      { partyId: party.id, name: party.name, crest: { emblem: party.crest.emblem, banner: party.crest.banner } }
    ])
  )
}
