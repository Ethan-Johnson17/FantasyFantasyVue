import mongoose, { type ClientSession } from 'mongoose'
import { Forbidden, NotFound } from '../../lib/errors.js'
import type { AccountDocument } from '../accounts/account.model.js'
import { LeagueModel, type LeagueDocument } from './league.model.js'
import { PartyModel, type PartyDocument } from './party.model.js'

/** Runs work in a transaction; retries transient errors and aborts on any thrown error. */
export function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  return mongoose.connection.transaction(work)
}

/**
 * Loads a league the viewer hosts. Non-members of private leagues get 404 so the league's
 * existence isn't revealed; members who aren't the host get 403.
 */
export async function loadLeagueAsHost(viewer: AccountDocument, leagueId: string): Promise<LeagueDocument> {
  const league = await LeagueModel.findById(leagueId)
  if (!league) throw new NotFound()
  if (league.hostId.equals(viewer._id)) return league
  const isMember = await PartyModel.exists({ leagueId: league._id, accountId: viewer._id })
  if (!isMember && league.visibility !== 'public') throw new NotFound()
  throw new Forbidden('Only the host can do that')
}

/** Loads a league and the viewer's party in it; 404 unless the viewer is a member. */
export async function loadLeagueAsMember(
  viewer: AccountDocument,
  leagueId: string
): Promise<{ league: LeagueDocument; party: PartyDocument }> {
  const league = await LeagueModel.findById(leagueId)
  const party = league && (await PartyModel.findOne({ leagueId: league._id, accountId: viewer._id }))
  if (!league || !party) throw new NotFound()
  return { league, party }
}

/** Loads a league the viewer may see: members always, anyone for public leagues. */
export async function loadVisibleLeague(viewer: AccountDocument, leagueId: string): Promise<LeagueDocument> {
  const league = await LeagueModel.findById(leagueId)
  if (!league) throw new NotFound()
  if (league.visibility === 'public') return league
  const isMember = await PartyModel.exists({ leagueId: league._id, accountId: viewer._id })
  if (!isMember) throw new NotFound()
  return league
}
