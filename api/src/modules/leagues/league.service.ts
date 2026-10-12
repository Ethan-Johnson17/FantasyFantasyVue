import mongoose, { type ClientSession, type Types } from 'mongoose'
import { isDuplicateKeyError } from '../../db/mongoose.js'
import { Conflict, Forbidden, NotFound } from '../../lib/errors.js'
import { AccountModel, type AccountDocument } from '../accounts/account.model.js'
import { LeagueModel, type LeagueDocument, type LeagueStatus } from './league.model.js'
import type { CreateLeagueInput, PartyInput, UpdateLeagueInput, UpdatePartyInput } from './league.schemas.js'
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
  color: string
  owner: ProfileView
  isMine: boolean
}

export interface LeagueSummaryView {
  id: string
  name: string
  status: string
  visibility: string
  cadence: string
  maxParties: number
  partyCount: number
  host: ProfileView
  isHost: boolean
  /** Only shown to members, and for public leagues. */
  pin?: string
  createdAt: Date
}

export interface LeagueDetailView extends LeagueSummaryView {
  rulesetVersion: number
  parties: PartyView[]
}

export interface MyLeagueView extends LeagueSummaryView {
  myParty: { id: string; name: string; color: string }
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
    parties: parties.map(party => ({
      id: party.id,
      name: party.name,
      color: party.color,
      owner: profileOf(profiles, party.accountId),
      isMine: party.accountId.equals(viewer._id)
    }))
  }
}

export async function listMyLeagues(viewer: AccountDocument): Promise<MyLeagueView[]> {
  const parties = await PartyModel.find({ accountId: viewer._id })
  const partyByLeague = new Map(parties.map(party => [party.leagueId.toString(), party]))
  const leagues = await LeagueModel.find({ _id: trusted({ $in: parties.map(party => party.leagueId) }) }).sort({
    updatedAt: -1
  })
  const profiles = await loadProfiles(leagues.map(league => league.hostId))
  return leagues.flatMap(league => {
    const party = partyByLeague.get(league.id)
    if (!party) return []
    return [
      {
        ...toSummary(league, viewer, profiles, true),
        myParty: { id: party.id, name: party.name, color: party.color }
      }
    ]
  })
}

/** Public leagues that still have room. */
export async function listPublicLeagues(viewer: AccountDocument, page: number): Promise<LeagueSummaryView[]> {
  const leagues = await LeagueModel.find({
    visibility: 'public',
    status: 'forming',
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

export async function createLeague(host: AccountDocument, input: CreateLeagueInput): Promise<LeagueDetailView> {
  const { party, ...settings } = input
  for (let attempt = 1; ; attempt++) {
    try {
      const leagueId = await inTransaction(async session => {
        const [league] = await LeagueModel.create(
          [{ ...settings, hostId: host._id, partyCount: 1, pin: generatePin() }],
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

export async function joinLeague(member: AccountDocument, pin: string, party: PartyInput): Promise<LeagueDetailView> {
  const leagueId = await inTransaction(async session => {
    // Claim a slot atomically: only succeeds while forming and below capacity.
    const league = await LeagueModel.findOneAndUpdate(
      { pin, status: 'forming', $expr: trusted({ $lt: ['$partyCount', '$maxParties'] }) },
      { $inc: { partyCount: 1 } },
      { session, returnDocument: 'after' }
    )
    if (!league) throw await explainJoinFailure(pin, session)
    try {
      await PartyModel.create([{ ...party, leagueId: league._id, accountId: member._id }], { session })
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
  await loadLeagueAsHost(viewer, leagueId)
  const capacityGuard = input.maxParties === undefined ? {} : { partyCount: trusted({ $lte: input.maxParties }) }
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
  const canceled = await LeagueModel.findOneAndUpdate(
    { _id: leagueId, status: trusted({ $in: ACTIVE_STATUSES }) },
    { $set: { status: 'canceled' } }
  )
  if (!canceled) throw new Conflict('This league has already ended')
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
    color: party.color,
    owner: profileOf(await loadProfiles([owner._id]), owner._id),
    isMine: true
  }
}

// ---------------------------------------------------------------------------
// Helpers

/** Runs work in a transaction; retries transient errors and aborts on any thrown error. */
function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  return mongoose.connection.transaction(work)
}

async function removePartyFromLeague(league: LeagueDocument, party: PartyDocument): Promise<void> {
  await inTransaction(async session => {
    const released = await LeagueModel.updateOne(
      { _id: league._id, status: 'forming' },
      { $inc: { partyCount: -1 } },
      { session }
    )
    if (released.modifiedCount === 0) throw notForming()
    const deleted = await PartyModel.deleteOne({ _id: party._id }, { session })
    if (deleted.deletedCount === 0) throw new NotFound()
  })
}

/**
 * Loads a league the viewer hosts. Non-members of private leagues get 404 so the league's
 * existence isn't revealed; members who aren't the host get 403.
 */
async function loadLeagueAsHost(viewer: AccountDocument, leagueId: string): Promise<LeagueDocument> {
  const league = await LeagueModel.findById(leagueId)
  if (!league) throw new NotFound()
  if (league.hostId.equals(viewer._id)) return league
  const isMember = await PartyModel.exists({ leagueId: league._id, accountId: viewer._id })
  if (!isMember && league.visibility !== 'public') throw new NotFound()
  throw new Forbidden('Only the host can do that')
}

async function explainJoinFailure(pin: string, session: ClientSession): Promise<Error> {
  const league = await LeagueModel.findOne({ pin }).session(session)
  if (!league) return new NotFound('No league found with that PIN')
  if (league.status !== 'forming') return new Conflict('This league is no longer accepting parties')
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
  // Accounts are never deleted today; this fallback keeps views valid if that changes.
  return profiles.get(id.toString()) ?? { id: id.toString(), displayName: 'Unknown adventurer' }
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
    visibility: league.visibility,
    cadence: league.cadence,
    maxParties: league.maxParties,
    partyCount: league.partyCount,
    host: profileOf(profiles, league.hostId),
    isHost: league.hostId.equals(viewer._id),
    ...(showPin ? { pin: league.pin } : {}),
    createdAt: league.createdAt
  }
}
