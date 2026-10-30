import mongoose, { type ClientSession, type Types } from 'mongoose'
import { isDuplicateKeyError } from '../../db/mongoose.js'
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js'
import { AccountModel, type AccountDocument } from '../accounts/account.model.js'
import { expireLeagueChat, unreadCount } from '../chat/chat.service.js'
import { RULESET_FOR_MODE } from '../scoring/rulesets.js'
import { advanceLeague } from '../season/advance.js'
import { resolvesAt, seasonLength } from '../season/calendar.js'
import { crossoverWindow } from '../season/nflWeeks.js'
import { partyOutlook, type PartyOutlook } from '../season/outlook.service.js'
import { computeStandings } from '../season/season.service.js'
import { inTransaction, loadLeagueAsHost } from './league.access.js'
import { LeagueModel, type LeagueDocument, type LeagueStatus } from './league.model.js'
import type { CreateLeagueInput, PartyInput, UpdateLeagueInput, UpdatePartyInput } from './league.schemas.js'
import { DEFAULT_CREST, type Crest } from './crests.js'
import { PartyModel, type PartyDocument } from './party.model.js'
import { generatePin } from './pin.js'

/*
 * League and party rules. Clients send intents (create, join, leave...), never whole documents;
 * every permission and state check happens here.
 *
 * Queries use mongoose.trusted() for intentional operators, because the global sanitizeFilter
 * setting neutralizes any operator that isn't explicitly trusted.
 */

const { trusted } = mongoose
const PUBLIC_PAGE_SIZE = 20
const PIN_ATTEMPTS = 5
const ACTIVE_STATUSES: readonly LeagueStatus[] = ['forming', 'drafting', 'active']

export interface ProfileView {
  id: string
  displayName: string
  picture?: string
}

export interface PartyView {
  id: string
  name: string
  crest: Crest
  owner: ProfileView
  isMine: boolean
  /** Only included for the viewer's own party */
  autoSwap?: boolean
}

export interface LeagueSummaryView {
  id: string
  name: string
  status: string
  mode: string
  visibility: string
  cadence: string
  maxParties: number
  partyCount: number
  host: ProfileView
  isHost: boolean
  /** Only shown to members, and for public leagues. */
  pin?: string
  /** When the automatic draft runs (set once scheduled) */
  draftAt: Date | null
  /** When game week 1 resolves (set once the draft has run) */
  weekOneAt: Date | null
  /** Game weeks played so far */
  resolvedWeeks: number
  /** Game weeks in the season: 14 in Classic; Crossover's from its first NFL week through week 17, once drafted */
  seasonWeeks: number
  /** When the next game week resolves, once the season has started */
  nextResolvesAt: Date | null
  /** Dynasty only: which season of the chain this is, and the seasons before and after it */
  dynasty: { seasons: number; number: number; previousLeagueId: string | null; nextLeagueId: string | null } | null
  /** Dynasty, between seasons: parties waiting for a new member to take them over (join with `takeOver`) */
  openParties: { id: string; name: string; crest: Crest }[]
  createdAt: Date
}

export interface DraftView {
  /** Party ids in first-round pick order */
  order: string[]
  picks: { round: number; overall: number; partyId: string; heroId: string }[]
}

export interface LeagueDetailView extends LeagueSummaryView {
  rulesetVersion: number
  parties: PartyView[]
  /** Set once the draft has run */
  draft: DraftView | null
}

export interface MyLeagueView extends LeagueSummaryView {
  myParty: { id: string; name: string; crest: Crest }
  /** My party's place once games have been played */
  standing: { rank: number; wins: number; losses: number; draws: number } | null
  /** Next battle, last result, and anything to fix before the lineup locks */
  outlook: PartyOutlook
  /** Chat messages from others I haven't seen, capped (see UNREAD_CAP) */
  unreadChat: number
}

// ---------------------------------------------------------------------------
// Queries

export async function getLeague(viewer: AccountDocument, leagueId: string): Promise<LeagueDetailView> {
  const league = await LeagueModel.findById(leagueId)
  if (!league) throw new NotFound()
  const parties = await PartyModel.find({ leagueId: league._id }).sort({ createdAt: 1 })
  const isMember = parties.some(party => party.accountId.equals(viewer._id))
  if (!isMember && league.visibility !== 'public') throw new NotFound()

  const profiles = await loadProfiles([league.hostId, ...parties.map(party => party.accountId)])
  return {
    ...toSummary(league, viewer, profiles, isMember),
    rulesetVersion: league.rulesetVersion,
    draft: draftOf(league),
    parties: parties.map(party => ({
      id: party.id,
      name: party.name,
      crest: crestOf(party),
      owner: profileOf(profiles, party.accountId),
      isMine: party.accountId.equals(viewer._id)
    }))
  }
}

export async function listMyLeagues(viewer: AccountDocument): Promise<MyLeagueView[]> {
  const parties = await PartyModel.find({ accountId: viewer._id })
  for (const party of parties) await advanceLeague(party.leagueId.toString())
  const partyByLeague = new Map(parties.map(party => [party.leagueId.toString(), party]))
  // A dynasty shows as its latest season; earlier seasons stay reachable from it.
  const leagues = await LeagueModel.find({ _id: trusted({ $in: parties.map(party => party.leagueId) }), 'dynasty.nextId': null }).sort({
    updatedAt: -1
  })
  const profiles = await loadProfiles(leagues.map(league => league.hostId))
  const views = await Promise.all(
    leagues.map(async league => {
      const party = partyByLeague.get(league.id)
      if (!party) return null
      return {
        ...toSummary(league, viewer, profiles, true),
        myParty: { id: party.id, name: party.name, crest: crestOf(party) },
        standing: league.resolvedWeeks > 0 ? await standingOf(league, party.id) : null,
        outlook: await partyOutlook(league, party),
        unreadChat: await unreadCount(party)
      }
    })
  )
  return views.filter((view): view is MyLeagueView => view !== null)
}

/** Public leagues that still have room. */
/** Public leagues that still have room, newest first, leaving out leagues the viewer is already in. */
export async function listPublicLeagues(viewer: AccountDocument, page: number): Promise<LeagueSummaryView[]> {
  const mine = await PartyModel.distinct('leagueId', { accountId: viewer._id })
  const leagues = await LeagueModel.find({
    visibility: 'public',
    status: 'forming',
    _id: trusted({ $nin: mine }),
    $expr: trusted({ $lt: ['$partyCount', '$maxParties'] })
  })
    .sort({ createdAt: -1 })
    .skip((page - 1) * PUBLIC_PAGE_SIZE)
    .limit(PUBLIC_PAGE_SIZE)
  const profiles = await loadProfiles(leagues.map(league => league.hostId))
  return leagues.map(league => toSummary(league, viewer, profiles, true))
}

/** What someone holding a PIN sees before joining. */
export async function previewLeagueByPin(viewer: AccountDocument, pin: string): Promise<LeagueSummaryView> {
  const league = await LeagueModel.findOne({ pin })
  if (!league) throw new NotFound('No league found with that PIN')
  const profiles = await loadProfiles([league.hostId])
  return toSummary(league, viewer, profiles, true)
}

// ---------------------------------------------------------------------------
// Commands

export interface CreateOptions {
  /** Crossover leagues can be created only once the mode is finished (CROSSOVER_ENABLED) */
  crossoverEnabled: boolean
}

export async function createLeague(host: AccountDocument, input: CreateLeagueInput, options: CreateOptions): Promise<LeagueDetailView> {
  const { party, dynastySeasons, ...requested } = input
  const crossover = requested.mode === 'crossover'
  if (crossover && dynastySeasons) throw new BadRequest('Dynasty leagues are Classic for now')
  if (crossover) {
    if (!options.crossoverEnabled) throw new Conflict('Crossover leagues aren’t available yet')
    // Refuse up front when the NFL season is nearly over (or hasn't been scheduled), not only at the draft.
    await crossoverWindow(new Date())
  }
  // Crossover follows the NFL's weeks, whatever cadence was sent.
  const settings = { ...requested, ...(crossover ? { cadence: 'weekly' as const } : {}), rulesetVersion: RULESET_FOR_MODE[requested.mode] }
  for (let attempt = 1; ; attempt++) {
    try {
      const leagueId = await inTransaction(async session => {
        const _id = new mongoose.Types.ObjectId()
        // A dynasty's first season is the root of its chain.
        const dynasty = dynastySeasons ? { seasons: dynastySeasons, number: 1, rootId: _id, previousId: null, nextId: null } : null
        const [league] = await LeagueModel.create(
          [{ _id, ...settings, dynasty, hostId: host._id, partyCount: 1, pin: generatePin() }],
          { session }
        )
        if (!league) throw new Error('League was not created')
        await PartyModel.create([{ ...party, leagueId: league._id, accountId: host._id }], { session })
        return league.id
      })
      return await getLeague(host, leagueId)
    } catch (error) {
      // A random PIN can collide with an existing one; pick another.
      if (isDuplicateKeyError(error, 'pin') && attempt < PIN_ATTEMPTS) continue
      throw error
    }
  }
}

/**
 * Joins a league by PIN with a new party, or (Dynasty, between seasons) takes over an open party: its history and
 * keepers carry on under the new member, with the name and crest they chose.
 */
export async function joinLeague(member: AccountDocument, pin: string, party: PartyInput, takeOver?: string): Promise<LeagueDetailView> {
  const leagueId = await inTransaction(async session => {
    // Claim a slot atomically: only succeeds while forming and below capacity. Open parties hold their places, so a
    // new party needs room beyond them; a takeover claims the open party itself.
    const league = takeOver
      ? await LeagueModel.findOneAndUpdate(
          { pin, status: 'forming', 'openParties._id': takeOver },
          { $pull: { openParties: { _id: takeOver } }, $inc: { partyCount: 1 } },
          { session, returnDocument: 'before' }
        )
      : await LeagueModel.findOneAndUpdate(
          { pin, status: 'forming', $expr: trusted({ $lt: [{ $add: ['$partyCount', { $size: '$openParties' }] }, '$maxParties'] }) },
          { $inc: { partyCount: 1 } },
          { session, returnDocument: 'after' }
        )
    if (!league) throw await explainJoinFailure(pin, session, takeOver)
    const open = takeOver ? league.openParties.find(entry => entry._id.toString() === takeOver) : undefined
    try {
      await PartyModel.create(
        [
          {
            ...party,
            leagueId: league._id,
            accountId: member._id,
            ...(open ? { previousPartyId: open.previousPartyId, keepers: [...open.keepers] } : {})
          }
        ],
        { session }
      )
    } catch (error) {
      throw toPartyConflict(error)
    }
    return league.id
  })
  return getLeague(member, leagueId)
}

export async function updateLeague(
  viewer: AccountDocument,
  leagueId: string,
  input: UpdateLeagueInput
): Promise<LeagueDetailView> {
  const league = await loadLeagueAsHost(viewer, leagueId)
  if (league.mode === 'crossover' && input.cadence !== undefined && input.cadence !== 'weekly') {
    throw new BadRequest('Crossover leagues follow the NFL’s weeks, so they’re always weekly')
  }
  // Open parties (Dynasty, between seasons) hold their places too.
  const capacityGuard =
    input.maxParties === undefined ? {} : { $expr: trusted({ $lte: [{ $add: ['$partyCount', { $size: '$openParties' }] }, input.maxParties] }) }
  const updated = await LeagueModel.findOneAndUpdate(
    { _id: leagueId, status: 'forming', ...capacityGuard },
    { $set: input },
    { runValidators: true, returnDocument: 'after' }
  )
  if (!updated) {
    const league = await LeagueModel.findById(leagueId)
    if (league?.status !== 'forming') throw notForming()
    throw new Conflict('Max parties cannot be lower than the number of parties already in the league')
  }
  return getLeague(viewer, leagueId)
}

export async function cancelLeague(viewer: AccountDocument, leagueId: string): Promise<LeagueDetailView> {
  await loadLeagueAsHost(viewer, leagueId)
  const endedAt = new Date()
  const canceled = await LeagueModel.findOneAndUpdate(
    { _id: leagueId, status: trusted({ $in: ACTIVE_STATUSES }) },
    { $set: { status: 'canceled', endedAt } }
  )
  if (!canceled) throw new Conflict('This league has already ended')
  await expireLeagueChat(leagueId, endedAt)
  return getLeague(viewer, leagueId)
}

export async function leaveLeague(member: AccountDocument, leagueId: string): Promise<void> {
  const league = await LeagueModel.findById(leagueId)
  const party = league && (await PartyModel.findOne({ leagueId: league._id, accountId: member._id }))
  if (!league || !party) throw new NotFound()
  if (league.hostId.equals(member._id)) throw new Conflict('The host cannot leave; cancel the league instead')
  await removePartyFromLeague(league, party)
}

export async function removeParty(viewer: AccountDocument, leagueId: string, partyId: string): Promise<LeagueDetailView> {
  const league = await loadLeagueAsHost(viewer, leagueId)
  const party = await PartyModel.findOne({ _id: partyId, leagueId: league._id })
  if (!party) throw new NotFound()
  if (party.accountId.equals(league.hostId)) throw new Conflict("The host's party cannot be removed")
  await removePartyFromLeague(league, party)
  return getLeague(viewer, leagueId)
}

export async function updateParty(owner: AccountDocument, partyId: string, input: UpdatePartyInput): Promise<PartyView> {
  const party = await PartyModel.findOne({ _id: partyId, accountId: owner._id })
  if (!party) throw new NotFound()
  const league = await LeagueModel.findById(party.leagueId)
  if (!league || !ACTIVE_STATUSES.includes(league.status)) throw new Conflict('This league has already ended')
  party.set(input)
  try {
    await party.save()
  } catch (error) {
    throw toPartyConflict(error)
  }
  return {
    id: party.id,
    name: party.name,
    crest: crestOf(party),
    owner: profileOf(await loadProfiles([owner._id]), owner._id),
    isMine: true,
    autoSwap: party.autoSwap
  }
}

// ---------------------------------------------------------------------------
// Helpers

/**
 * Takes a party out of a forming league. Between dynasty seasons, a party carried over from last season isn't lost: it
 * becomes an open party, with its history and keepers, for a new member to take over.
 */
export async function removePartyFromLeague(league: LeagueDocument, party: PartyDocument): Promise<void> {
  const reopen = !!league.dynasty && league.dynasty.number > 1 && party.previousPartyId
  await inTransaction(async session => {
    const opened = reopen
      ? { $push: { openParties: { previousPartyId: party.previousPartyId, name: party.name, crest: { emblem: party.crest.emblem, banner: party.crest.banner }, keepers: [...(party.keepers ?? [])] } } }
      : {}
    const released = await LeagueModel.updateOne(
      { _id: league._id, status: 'forming' },
      { $inc: { partyCount: -1 }, ...opened },
      { session }
    )
    if (released.modifiedCount === 0) throw notForming()
    const deleted = await PartyModel.deleteOne({ _id: party._id }, { session })
    if (deleted.deletedCount === 0) throw new NotFound()
  })
}

async function explainJoinFailure(pin: string, session: ClientSession, takeOver?: string): Promise<Error> {
  const league = await LeagueModel.findOne({ pin }).session(session)
  if (!league) return new NotFound('No league found with that PIN')
  if (league.status !== 'forming') return new Conflict('This league is no longer accepting parties')
  if (takeOver) return new Conflict('That party has already been taken over')
  return new Conflict('This league is full')
}

function toPartyConflict(error: unknown): unknown {
  if (isDuplicateKeyError(error, 'accountId')) return new Conflict('You already have a party in this league')
  if (isDuplicateKeyError(error, 'name')) return new Conflict('That party name is taken in this league')
  return error
}

const notForming = () => new Conflict('Parties can only change while the league is forming')

async function loadProfiles(ids: readonly Types.ObjectId[]): Promise<Map<string, ProfileView>> {
  const accounts = await AccountModel.find({ _id: trusted({ $in: ids }) }, 'displayName picture')
  return new Map(
    accounts.map(account => [
      account.id,
      {
        id: account.id,
        displayName: account.displayName,
        ...(account.picture ? { picture: account.picture } : {})
      }
    ])
  )
}

function profileOf(profiles: ReadonlyMap<string, ProfileView>, id: Types.ObjectId): ProfileView {
  // A deleted account (see accounts/deletion.service.ts): its party stays, with no name attached.
  return profiles.get(id.toString()) ?? { id: id.toString(), displayName: 'Former adventurer' }
}

function toSummary(
  league: LeagueDocument,
  viewer: AccountDocument,
  profiles: ReadonlyMap<string, ProfileView>,
  canSeePin: boolean
): LeagueSummaryView {
  const showPin = canSeePin || league.visibility === 'public'
  return {
    id: league.id,
    name: league.name,
    status: league.status,
    mode: league.mode,
    visibility: league.visibility,
    cadence: league.cadence,
    maxParties: league.maxParties,
    partyCount: league.partyCount,
    host: profileOf(profiles, league.hostId),
    isHost: league.hostId.equals(viewer._id),
    ...(showPin ? { pin: league.pin } : {}),
    draftAt: league.draftAt ?? null,
    weekOneAt: league.weekOneAt ?? null,
    resolvedWeeks: league.resolvedWeeks,
    seasonWeeks: seasonLength(league),
    nextResolvesAt: league.status === 'active' ? resolvesAt(league, league.resolvedWeeks + 1) : null,
    dynasty: league.dynasty
      ? {
          seasons: league.dynasty.seasons,
          number: league.dynasty.number,
          previousLeagueId: league.dynasty.previousId?.toString() ?? null,
          nextLeagueId: league.dynasty.nextId?.toString() ?? null
        }
      : null,
    openParties: league.openParties.map(open => ({ id: open._id.toString(), name: open.name, crest: { emblem: open.crest.emblem, banner: open.crest.banner } as Crest })),
    createdAt: league.createdAt
  }
}

function crestOf(party: PartyDocument): Crest {
  const crest = party.crest as Partial<Crest> | null | undefined
  return crest?.emblem && crest.banner ? { emblem: crest.emblem, banner: crest.banner } : DEFAULT_CREST
}

function draftOf(league: LeagueDocument): DraftView | null {
  if (!league.draftOrder?.length || !league.draftPicks?.length) return null
  return {
    order: league.draftOrder.map(String),
    picks: league.draftPicks.map(pick => ({
      round: pick.round,
      overall: pick.overall,
      partyId: pick.partyId.toString(),
      heroId: pick.heroId.toString()
    }))
  }
}

async function standingOf(league: LeagueDocument, partyId: string): Promise<MyLeagueView['standing']> {
  const standings = await computeStandings(league)
  const index = standings.findIndex(row => row.partyId === partyId)
  const row = standings[index]
  return row ? { rank: index + 1, wins: row.wins, losses: row.losses, draws: row.draws } : null
}
