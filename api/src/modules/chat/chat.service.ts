import mongoose, { type ClientSession, type Types } from 'mongoose'
import { BadRequest, Conflict, Forbidden, NotFound } from '../../lib/errors.js'
import type { AccountDocument } from '../accounts/account.model.js'
import { loadLeagueAsMember } from '../leagues/league.access.js'
import type { LeagueDocument } from '../leagues/league.model.js'
import { PartyModel } from '../leagues/party.model.js'
import { CHAT_RETENTION_MS, ChatMessageModel, type ChatMessageDocument } from './chatMessage.model.js'
import { filterProfanity } from './profanity.js'

const { trusted } = mongoose

/** Messages per page: the latest page is what the app polls while chat is open. */
export const CHAT_PAGE_SIZE = 50

export interface ChatMessageView {
  id: string
  body: string
  at: string
  /** The author's party; null once they've left the league */
  author: { partyId: string; name: string; crest: { emblem: string; banner: string } } | null
  mine: boolean
  reportedByMe: boolean
  /** How many members reported it; shown to the host only, null for everyone else */
  reports: number | null
}

export interface ChatPageView {
  /** Oldest first */
  messages: ChatMessageView[]
  /** Older messages exist: pass the first message's id as `before` to load them */
  hasMore: boolean
  /** The viewer hosts the league, so they can remove anyone's message */
  canModerate: boolean
  /** The league has been canceled; chat is read-only until it's deleted */
  readOnly: boolean
}

/** When a league's chat is deleted: a set time after the league ends, or null while it's running. */
export function chatExpiry(league: Pick<LeagueDocument, 'endedAt'>): Date | null {
  return league.endedAt ? new Date(league.endedAt.getTime() + CHAT_RETENTION_MS) : null
}

/** Starts the retention clock on a league's chat; called when the season ends or the league is canceled. */
export async function expireLeagueChat(leagueId: Types.ObjectId | string, endedAt: Date, session?: ClientSession): Promise<void> {
  await ChatMessageModel.updateMany(
    { leagueId },
    { $set: { expiresAt: new Date(endedAt.getTime() + CHAT_RETENTION_MS) } },
    session ? { session } : {}
  )
}

/**
 * Cleans a message: drops control characters (keeping line breaks), keeps at most one blank line in
 * a row, and masks profanity. Throws if nothing is left.
 */
export function cleanMessage(text: string): string {
  const cleaned = text
    // eslint-disable-next-line no-control-regex -- removing control characters is the point
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!cleaned) throw new BadRequest('Write a message first')
  return filterProfanity(cleaned)
}

export async function listMessages(viewer: AccountDocument, leagueId: string, before?: string): Promise<ChatPageView> {
  const { league } = await loadLeagueAsMember(viewer, leagueId)
  const found = await ChatMessageModel.find({ leagueId: league._id, ...(before ? { _id: trusted({ $lt: before }) } : {}) })
    .sort({ _id: -1 })
    .limit(CHAT_PAGE_SIZE + 1)
  const page = found.slice(0, CHAT_PAGE_SIZE).reverse()
  const canModerate = league.hostId.equals(viewer._id)
  return {
    messages: await toViews(page, viewer, canModerate),
    hasMore: found.length > CHAT_PAGE_SIZE,
    canModerate,
    readOnly: league.status === 'canceled'
  }
}

export async function postMessage(viewer: AccountDocument, leagueId: string, text: string): Promise<ChatMessageView> {
  const { league, party } = await loadLeagueAsMember(viewer, leagueId)
  if (league.status === 'canceled') throw new Conflict('This league was canceled, so its chat is closed')
  const message = await ChatMessageModel.create({
    leagueId: league._id,
    partyId: party._id,
    accountId: viewer._id,
    body: cleanMessage(text),
    expiresAt: chatExpiry(league)
  })
  return toView(message, viewer, league.hostId.equals(viewer._id))
}

/** Authors can remove their own messages; the host can remove anyone's. */
export async function deleteMessage(viewer: AccountDocument, leagueId: string, messageId: string): Promise<void> {
  const { league } = await loadLeagueAsMember(viewer, leagueId)
  const message = await ChatMessageModel.findOne({ _id: messageId, leagueId: league._id })
  if (!message) throw new NotFound()
  if (!message.accountId.equals(viewer._id) && !league.hostId.equals(viewer._id)) {
    throw new Forbidden('Only the host can remove other members’ messages')
  }
  await message.deleteOne()
}

/** Flags a message for the host. Reporting twice counts once; your own messages can't be reported. */
export async function reportMessage(viewer: AccountDocument, leagueId: string, messageId: string): Promise<ChatMessageView> {
  const { league } = await loadLeagueAsMember(viewer, leagueId)
  const message = await ChatMessageModel.findOne({ _id: messageId, leagueId: league._id })
  if (!message) throw new NotFound()
  if (message.accountId.equals(viewer._id)) throw new BadRequest('You can’t report your own message')
  const updated = await ChatMessageModel.findOneAndUpdate(
    { _id: message._id },
    { $addToSet: { reportedBy: viewer._id } },
    { returnDocument: 'after' }
  )
  if (!updated) throw new NotFound() // removed in the meantime
  return toView(updated, viewer, league.hostId.equals(viewer._id))
}

async function toView(message: ChatMessageDocument, viewer: AccountDocument, canModerate: boolean): Promise<ChatMessageView> {
  const [view] = await toViews([message], viewer, canModerate)
  if (!view) throw new Error('A message always has a view')
  return view
}

async function toViews(messages: readonly ChatMessageDocument[], viewer: AccountDocument, canModerate: boolean): Promise<ChatMessageView[]> {
  const partyIds = [...new Set(messages.map(message => message.partyId.toString()))]
  const parties = new Map((await PartyModel.find({ _id: trusted({ $in: partyIds }) })).map(party => [party.id, party]))
  return messages.map(message => {
    const party = parties.get(message.partyId.toString())
    return {
      id: message.id,
      body: message.body,
      at: message.createdAt.toISOString(),
      author: party ? { partyId: party.id, name: party.name, crest: { emblem: party.crest.emblem, banner: party.crest.banner } } : null,
      mine: message.accountId.equals(viewer._id),
      reportedByMe: message.reportedBy.some(id => id.equals(viewer._id)),
      reports: canModerate ? message.reportedBy.length : null
    }
  })
}
