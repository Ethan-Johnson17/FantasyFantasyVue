import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'

/*
 * League chat. Members only, even in public leagues. Bodies are stored already filtered (see profanity.ts),
 * so the original wording is never kept. Messages last the season, then are deleted CHAT_RETENTION_MS
 * after the league ends: `expiresAt` is set when it ends, and MongoDB's TTL index removes them.
 */

export const CHAT_MESSAGE_MAX = 500
/** How long chat outlives its league: 30 days after the season ends or the league is canceled. */
export const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

const chatMessageSchema = new Schema(
  {
    leagueId: { type: Schema.Types.ObjectId, ref: 'League', required: true, immutable: true },
    // The author: their party for display (it can leave the league), their account for ownership
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true, immutable: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, immutable: true },
    body: { type: String, required: true, maxlength: CHAT_MESSAGE_MAX, immutable: true },
    // Members who reported the message; the host sees how many
    reportedBy: { type: [{ type: Schema.Types.ObjectId, ref: 'Account' }], default: [] },
    expiresAt: { type: Date, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)
chatMessageSchema.index({ leagueId: 1, _id: -1 })
// Deletes each message once its expiresAt passes; messages without one (the league is still running) stay.
chatMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type ChatMessage = InferSchemaType<typeof chatMessageSchema>
export type ChatMessageDocument = HydratedDocument<ChatMessage>

export const ChatMessageModel = model('ChatMessage', chatMessageSchema)
