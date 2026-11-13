import mongoose from 'mongoose'
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js'
import type { AccountDocument } from '../accounts/account.model.js'
import type { HeroClass } from '../heroes/classes.js'
import { HeroModel, type HeroDocument } from '../heroes/hero.model.js'
import { toCrest, type Crest } from '../leagues/crests.js'
import { inTransaction, loadLeagueAsMember } from '../leagues/league.access.js'
import { LeagueModel, type LeagueDocument } from '../leagues/league.model.js'
import { PartyModel, type PartyDocument } from '../leagues/party.model.js'
import { repairParty, rosterProblem, type Whose } from '../roster/repair.js'
import { getRuleset, type LineupRules } from '../scoring/rulesets.js'
import { leaguePlayoffs, seasonLength } from '../season/calendar.js'
import { lockedThisWeek, readyWeekCount } from '../season/season.service.js'
import { TRADE_MAX_OPEN, TradeModel, type TradeDocument, type TradeStatus } from './trade.model.js'

const { trusted } = mongoose

/* Trades between parties. Rules: docs/TRADES_SPEC.md. */

/** Trades close when this many regular-season weeks are left */
export const TRADE_CLOSED_WEEKS = 4
/** Answered offers listed in the inbox */
const ANSWERED_SHOWN = 20

export interface TradeWindow {
  /** Trades can be made now */
  open: boolean
  /** The last game week a trade can count for; null when the season is too short for trades */
  lastWeek: number | null
}

/**
 * The league's trade window: from the draft until TRADE_CLOSED_WEEKS regular-season weeks are left. `played` is the
 * game weeks played (or due), so a week that's due but not yet resolved counts as played.
 */
export function tradeWindow(league: LeagueDocument, played: number = league.resolvedWeeks): TradeWindow {
  if (league.mode === 'solo') return { open: false, lastWeek: null }
  const regularWeeks = leaguePlayoffs(league)?.regularWeeks ?? seasonLength(league)
  const lastWeek = regularWeeks - TRADE_CLOSED_WEEKS
  if (lastWeek < 1) return { open: false, lastWeek: null }
  return { open: league.status === 'active' && Math.max(played, league.resolvedWeeks) < lastWeek, lastWeek }
}

/** How many heroes a party must release so a trade leaves it within the roster size. */
export function releasesNeeded(rosterCount: number, giving: number, getting: number, rosterSize: number): number {
  return Math.max(0, rosterCount - giving + getting - rosterSize)
}

// ---------------------------------------------------------------------------
// Views

interface TradeHero {
  heroId: string
  name: string
  heroClass: string
}

interface TradeParty {
  partyId: string
  name: string
  crest: Crest
}

export interface TradeView {
  id: string
  status: TradeStatus
  from: TradeParty
  to: TradeParty
  offered: TradeHero[]
  requested: TradeHero[]
  fromReleases: TradeHero[]
  toReleases: TradeHero[]
  /** Open and waiting on me to accept or decline */
  waitingOnMe: boolean
  /** Waiting on me: how many of my heroes I'd release on accepting */
  releasesNeeded: number
  createdAt: Date
  answeredAt: Date | null
  effectiveWeek: number | null
}

export interface TradesView {
  window: TradeWindow
  rosterSize: number
  /** Open offers to or from my party, newest first */
  open: TradeView[]
  /** My party's latest answered or expired offers, newest first */
  answered: TradeView[]
}

const ids = (list: readonly { toString(): string }[]) => list.map(id => id.toString())

async function views(league: LeagueDocument, trades: readonly TradeDocument[], mine: PartyDocument): Promise<TradeView[]> {
  if (trades.length === 0) return []
  const partyIds = new Set(trades.flatMap(trade => [trade.fromPartyId.toString(), trade.toPartyId.toString()]))
  const heroIds = new Set(trades.flatMap(trade => ids([...trade.offered, ...trade.requested, ...trade.fromReleases, ...trade.toReleases])))
  const [parties, heroes] = await Promise.all([
    PartyModel.find({ _id: trusted({ $in: [...partyIds] }) }, 'name crest'),
    HeroModel.find({ leagueId: league._id, _id: trusted({ $in: [...heroIds] }) }, 'name heroClass partyId')
  ])
  const partyById = new Map(parties.map(party => [party.id, party]))
  const heroById = new Map(heroes.map(hero => [hero.id, hero]))
  const rosterSize = getRuleset(league.rulesetVersion).lineup.rosterSize
  const myRoster = heroes.length ? await HeroModel.countDocuments({ leagueId: league._id, partyId: mine._id }) : 0
  const party = (id: { toString(): string }): TradeParty => {
    const found = partyById.get(id.toString())
    return { partyId: id.toString(), name: found?.name ?? 'Unknown', crest: toCrest(found?.crest) }
  }
  const hero = (id: string): TradeHero => {
    const found = heroById.get(id)
    return { heroId: id, name: found?.name ?? 'Unknown hero', heroClass: found?.heroClass ?? '' }
  }
  return trades.map(trade => {
    const waitingOnMe = trade.status === 'open' && trade.toPartyId.equals(mine._id)
    return {
      id: trade.id,
      status: trade.status,
      from: party(trade.fromPartyId),
      to: party(trade.toPartyId),
      offered: ids(trade.offered).map(hero),
      requested: ids(trade.requested).map(hero),
      fromReleases: ids(trade.fromReleases).map(hero),
      toReleases: ids(trade.toReleases).map(hero),
      waitingOnMe,
      releasesNeeded: waitingOnMe ? releasesNeeded(myRoster, trade.requested.length, trade.offered.length, rosterSize) : 0,
      createdAt: trade.createdAt,
      answeredAt: trade.answeredAt ?? null,
      effectiveWeek: trade.effectiveWeek ?? null
    }
  })
}

/** One trade's view. */
async function viewOf(league: LeagueDocument, trade: TradeDocument | null, mine: PartyDocument): Promise<TradeView> {
  const [view] = trade ? await views(league, [trade], mine) : []
  if (!view) throw new NotFound('That offer was not found')
  return view
}

/**
 * Expires the league's open offers that can no longer happen: the trade window closed, or a hero isn't where the offer
 * says any more. Safe to call often.
 */
export async function expireStaleTrades(league: LeagueDocument): Promise<void> {
  const open = await TradeModel.find({ leagueId: league._id, status: 'open' })
  if (open.length === 0) return
  const answeredAt = new Date()
  if (!tradeWindow(league, await readyWeekCount(league)).open) {
    await TradeModel.updateMany({ leagueId: league._id, status: 'open' }, { $set: { status: 'expired', answeredAt } })
    return
  }
  const heroes = await HeroModel.find({ leagueId: league._id, partyId: trusted({ $ne: null }) }, 'partyId')
  const partyOf = new Map(heroes.map(hero => [hero.id, hero.partyId?.toString()]))
  const on = (list: readonly { toString(): string }[], partyId: { toString(): string }) => list.every(id => partyOf.get(id.toString()) === partyId.toString())
  const stale = open.filter(
    trade => !on([...trade.offered, ...trade.fromReleases], trade.fromPartyId) || !on(trade.requested, trade.toPartyId)
  )
  if (stale.length) {
    await TradeModel.updateMany({ _id: trusted({ $in: stale.map(trade => trade._id) }), status: 'open' }, { $set: { status: 'expired', answeredAt } })
  }
}

/** Open offers waiting on the party to answer, for the badge on My leagues and the league's tabs. */
export async function tradeOffersFor(league: LeagueDocument, party: PartyDocument): Promise<number> {
  if (!(await TradeModel.exists({ toPartyId: party._id, status: 'open' }))) return 0
  await expireStaleTrades(league)
  return TradeModel.countDocuments({ toPartyId: party._id, status: 'open' })
}

/** My party's offers, both ways, and the trade window. */
export async function listTrades(member: AccountDocument, leagueId: string): Promise<TradesView> {
  const { league, party } = await loadLeagueAsMember(member, leagueId)
  await expireStaleTrades(league)
  const mine = { $or: [{ fromPartyId: party._id }, { toPartyId: party._id }] }
  const [open, answered] = await Promise.all([
    TradeModel.find({ leagueId: league._id, status: 'open', ...mine }).sort({ createdAt: -1, _id: -1 }),
    TradeModel.find({ leagueId: league._id, status: trusted({ $ne: 'open' }), ...mine }).sort({ answeredAt: -1, _id: -1 }).limit(ANSWERED_SHOWN)
  ])
  return {
    window: tradeWindow(league, await readyWeekCount(league)),
    rosterSize: getRuleset(league.rulesetVersion).lineup.rosterSize,
    open: await views(league, open, party),
    answered: await views(league, answered, party)
  }
}

// ---------------------------------------------------------------------------
// Checks shared by offering and accepting

/** Refuses a trade outside the window, or while a due week is unresolved (`ready` is the weeks due). */
function assertWindowOpen(league: LeagueDocument, ready: number): void {
  if (league.mode === 'solo') throw new BadRequest('Solo runs have no trades')
  if (league.status !== 'active') throw new Conflict('Trades can be made after the draft and until the trade deadline')
  const window = tradeWindow(league, ready)
  if (window.lastWeek === null) throw new Conflict('This season is too short for trades')
  if (!window.open) throw new Conflict(`The trade deadline has passed: trades closed after week ${String(window.lastWeek)}`)
}

/** Crossover: nobody whose game this week has kicked off can be traded or released. */
async function assertUnlocked(league: LeagueDocument, heroes: readonly HeroDocument[]): Promise<void> {
  const locked = await lockedThisWeek(league, heroes)
  const first = heroes.find(hero => locked.has(hero.id))
  if (first) throw new Conflict(`${first.name}’s game this week has kicked off: trade them after the week`)
}

interface Side {
  roster: readonly HeroDocument[]
  giving: readonly string[]
  getting: readonly HeroDocument[]
  releases: readonly string[]
  whose: Whose
}

/** One side of a trade: the releases it needs, and its roster afterwards. */
function checkSide(side: Side, rules: LineupRules, checkReleases: boolean): void {
  const leaving = new Set([...side.giving, ...side.releases])
  if (checkReleases) {
    const needed = releasesNeeded(side.roster.length, side.giving.length, side.getting.length, rules.rosterSize)
    if (side.releases.length !== needed) {
      throw new BadRequest(
        needed === 0
          ? 'This trade leaves room on your roster: release nobody'
          : `This trade leaves your roster ${String(needed)} over: release ${String(needed)} of your heroes`
      )
    }
  }
  const before: HeroClass[] = side.roster.map(hero => hero.heroClass)
  const after: HeroClass[] = [...side.roster.filter(hero => !leaving.has(hero.id)), ...side.getting].map(hero => hero.heroClass)
  const problem = rosterProblem(before, after, rules, side.whose)
  if (problem) throw new BadRequest(problem)
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(id => b.includes(id))

// ---------------------------------------------------------------------------
// Commands

export interface OfferInput {
  toPartyId: string
  offered: string[]
  requested: string[]
  releases: string[]
}

/** Sends an offer: some of my heroes (and any releases it needs) for some of theirs. */
export async function offerTrade(member: AccountDocument, leagueId: string, input: OfferInput): Promise<TradeView> {
  const { league, party } = await loadLeagueAsMember(member, leagueId)
  assertWindowOpen(league, await readyWeekCount(league))
  if (party._id.equals(input.toPartyId)) throw new BadRequest('Choose another party to trade with')
  const other = await PartyModel.findOne({ _id: input.toPartyId, leagueId: league._id })
  if (!other) throw new NotFound('That party is not in this league')
  if (input.releases.some(id => input.offered.includes(id))) throw new BadRequest('A hero you’re trading can’t also be released')

  const [mine, theirs] = await Promise.all([
    HeroModel.find({ leagueId: league._id, partyId: party._id }).select('+source'),
    HeroModel.find({ leagueId: league._id, partyId: other._id }).select('+source')
  ])
  const pick = (roster: readonly HeroDocument[], wanted: readonly string[]) => wanted.map(id => roster.find(hero => hero.id === id))
  const offered = pick(mine, input.offered)
  const releases = pick(mine, input.releases)
  const requested = pick(theirs, input.requested)
  if (offered.includes(undefined) || releases.includes(undefined)) throw new BadRequest('You can only offer or release heroes from your own party')
  if (requested.includes(undefined)) throw new BadRequest(`You can only ask for heroes from ${other.name}`)
  const found = (list: (HeroDocument | undefined)[]) => list.filter((hero): hero is HeroDocument => !!hero)

  await assertUnlocked(league, [...found(offered), ...found(releases), ...found(requested)])
  const rules = getRuleset(league.rulesetVersion).lineup
  checkSide({ roster: mine, giving: input.offered, getting: found(requested), releases: input.releases, whose: { mine: true } }, rules, true)

  await expireStaleTrades(league)
  const sent = await TradeModel.find({ fromPartyId: party._id, status: 'open' })
  if (sent.length >= TRADE_MAX_OPEN) throw new Conflict(`You have ${String(TRADE_MAX_OPEN)} open offers: withdraw one first`)
  const duplicate = sent.some(
    trade => trade.toPartyId.equals(other._id) && sameSet(ids(trade.offered), input.offered) && sameSet(ids(trade.requested), input.requested)
  )
  if (duplicate) throw new Conflict('You’ve already offered this trade')

  const trade = await TradeModel.create({
    leagueId: league._id,
    fromPartyId: party._id,
    toPartyId: other._id,
    offered: input.offered,
    requested: input.requested,
    fromReleases: input.releases
  })
  return viewOf(league, trade, party)
}

/** Loads one of the league's trades that involves my party. */
async function loadTrade(leagueId: string, tradeId: string, party: PartyDocument): Promise<TradeDocument> {
  const trade = await TradeModel.findOne({ _id: tradeId, leagueId })
  if (!trade || (!trade.fromPartyId.equals(party._id) && !trade.toPartyId.equals(party._id))) throw new NotFound('That offer was not found')
  return trade
}

/** Accepts an offer to my party: the heroes change hands at once, with the releases I pick if I'd be over. */
export async function acceptTrade(member: AccountDocument, leagueId: string, tradeId: string, toReleases: string[]): Promise<TradeView> {
  const { league, party } = await loadLeagueAsMember(member, leagueId)
  const trade = await loadTrade(league.id, tradeId, party)
  if (!trade.toPartyId.equals(party._id)) throw new BadRequest('Only the party the offer was sent to can accept it')
  if (trade.status !== 'open') throw new Conflict('That offer is no longer open')
  const ready = await readyWeekCount(league)
  assertWindowOpen(league, ready)
  if (toReleases.some(id => ids(trade.offered).includes(id) || ids(trade.requested).includes(id))) {
    throw new BadRequest('Release a hero who isn’t part of the trade')
  }
  const rules = getRuleset(league.rulesetVersion).lineup
  const from = await PartyModel.findById(trade.fromPartyId)
  if (!from) throw new Conflict('That offer is no longer open')

  await inTransaction(async session => {
    // As with claims: due weeks are resolved first, and writing the league conflicts with a battle being resolved.
    const upToDate = await LeagueModel.updateOne({ _id: league._id, status: 'active', resolvedWeeks: ready }, { $set: { updatedAt: new Date() } }, { session })
    if (upToDate.modifiedCount === 0) throw new Conflict('A battle is being resolved. Try again in a moment.')
    const accepted = await TradeModel.updateOne(
      { _id: trade._id, status: 'open' },
      { $set: { status: 'accepted', toReleases, answeredAt: new Date(), effectiveWeek: league.resolvedWeeks + 1 } },
      { session }
    )
    if (accepted.modifiedCount === 0) throw new Conflict('That offer is no longer open')

    const [senders, mine] = await Promise.all([
      HeroModel.find({ leagueId: league._id, partyId: from._id }).select('+source').session(session),
      HeroModel.find({ leagueId: league._id, partyId: party._id }).select('+source').session(session)
    ])
    const has = (roster: readonly HeroDocument[], list: readonly string[]) => list.every(id => roster.some(hero => hero.id === id))
    const offered = ids(trade.offered)
    const requested = ids(trade.requested)
    const fromReleases = ids(trade.fromReleases)
    if (!has(senders, [...offered, ...fromReleases]) || !has(mine, requested)) {
      throw new Conflict('Some of those heroes have changed hands since the offer: it can’t go through')
    }
    if (!has(mine, toReleases)) throw new BadRequest('You can only release heroes from your own party')
    const heroes = (roster: readonly HeroDocument[], list: readonly string[]) => roster.filter(hero => list.includes(hero.id))
    await assertUnlocked(league, [...heroes(senders, [...offered, ...fromReleases]), ...heroes(mine, [...requested, ...toReleases])])
    checkSide({ roster: senders, giving: offered, getting: heroes(mine, requested), releases: fromReleases, whose: { mine: false, name: from.name } }, rules, false)
    checkSide({ roster: mine, giving: requested, getting: heroes(senders, offered), releases: toReleases, whose: { mine: true } }, rules, true)

    // Dynasty XP stays with the party that earned it: a hero who changes hands starts again (modules/dynasty/xp.ts).
    const fresh = { xp: 0, earnedTrait: null }
    const move = async (list: readonly string[], fromParty: PartyDocument['_id'], toParty: PartyDocument['_id'] | null) => {
      if (list.length === 0) return
      const moved = await HeroModel.updateMany(
        { _id: trusted({ $in: list }), leagueId: league._id, partyId: fromParty },
        { $set: { partyId: toParty, ...fresh } },
        { session }
      )
      if (moved.modifiedCount !== list.length) throw new Conflict('Some of those heroes have changed hands since the offer: it can’t go through')
    }
    await move(offered, from._id, party._id)
    await move(requested, party._id, from._id)
    await move(fromReleases, from._id, null)
    await move(toReleases, party._id, null)

    await repairParty(league, rules, from._id, new Set([...offered, ...fromReleases]), requested, { mine: false, name: from.name }, session)
    await repairParty(league, rules, party._id, new Set([...requested, ...toReleases]), offered, { mine: true }, session)
  })
  // Other offers that shared a hero can't happen any more.
  await expireStaleTrades(league)
  return viewOf(league, await TradeModel.findById(trade._id), party)
}

/** Declines an offer to my party, or withdraws one I sent. */
export async function answerTrade(member: AccountDocument, leagueId: string, tradeId: string, answer: 'declined' | 'withdrawn'): Promise<TradeView> {
  const { league, party } = await loadLeagueAsMember(member, leagueId)
  const trade = await loadTrade(league.id, tradeId, party)
  const mineToAnswer = answer === 'declined' ? trade.toPartyId.equals(party._id) : trade.fromPartyId.equals(party._id)
  if (!mineToAnswer) {
    throw new BadRequest(answer === 'declined' ? 'Only the party the offer was sent to can decline it' : 'Only the sender can withdraw an offer')
  }
  const answered = await TradeModel.findOneAndUpdate({ _id: trade._id, status: 'open' }, { $set: { status: answer, answeredAt: new Date() } }, { new: true })
  if (!answered) throw new Conflict('That offer is no longer open')
  return viewOf(league, answered, party)
}
