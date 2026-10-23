import mongoose from 'mongoose'
import { isDuplicateKeyError } from '../../db/mongoose.js'
import { Conflict } from '../../lib/errors.js'
import { forgetChatAuthor } from '../chat/chat.service.js'
import { DraftRankingModel } from '../draft/ranking.model.js'
import { removePartyFromLeague } from '../leagues/league.service.js'
import { LeagueModel } from '../leagues/league.model.js'
import { PartyModel, type PartyDocument } from '../leagues/party.model.js'
import { AccountModel, type AccountDocument } from './account.model.js'

const { trusted } = mongoose

/** What a deleted member's party is called in leagues that are already underway. */
export const FORMER_PARTY_NAME = 'Former adventurer'
const RUNNING_STATUSES = ['forming', 'drafting', 'active'] as const

/**
 * Deletes an account and what it wrote, from the Account page.
 *
 * - Hosts must first cancel (or finish) the leagues they run, so no league is left without a host.
 * - Parties in leagues still forming leave them. Parties in leagues already drafted stay, so other
 *   members' seasons and schedules keep working, but are renamed "Former adventurer"; they're no
 *   longer linked to anyone, and signing in again starts a fresh account.
 * - Chat messages the account wrote are deleted, and its reports are withdrawn.
 *
 * The Auth0 sign-in record is separate; the privacy policy explains how to have it removed.
 */
export async function deleteAccount(account: AccountDocument): Promise<void> {
  const hosting = await LeagueModel.find({ hostId: account._id, status: trusted({ $in: RUNNING_STATUSES }) }, 'name')
  if (hosting.length) {
    const names = hosting.map(league => league.name).join(', ')
    throw new Conflict(`Cancel the leagues you host first: ${names}`)
  }

  const parties = await PartyModel.find({ accountId: account._id })
  const leagues = new Map(
    (await LeagueModel.find({ _id: trusted({ $in: parties.map(party => party.leagueId) }) })).map(league => [league.id, league])
  )
  for (const party of parties) {
    const league = leagues.get(party.leagueId.toString())
    if (league?.status === 'forming') {
      await removePartyFromLeague(league, party)
      await DraftRankingModel.deleteMany({ partyId: party._id })
    } else {
      await renameFormer(party)
    }
  }
  await forgetChatAuthor(account._id)
  await AccountModel.deleteOne({ _id: account._id })
}

/** Party names are unique within a league, so a second former member's party is numbered. */
async function renameFormer(party: PartyDocument): Promise<void> {
  for (let n = 1; ; n++) {
    try {
      await PartyModel.updateOne({ _id: party._id }, { $set: { name: n === 1 ? FORMER_PARTY_NAME : `${FORMER_PARTY_NAME} ${String(n)}` } })
      return
    } catch (error) {
      if (!isDuplicateKeyError(error, 'name')) throw error
    }
  }
}
