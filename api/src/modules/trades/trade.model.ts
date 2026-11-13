import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'

/*
 * A trade offer between two parties in a league (docs/TRADES_SPEC.md). Open until the other party accepts or declines,
 * the sender withdraws it, or it can no longer happen (a hero moved, the trade window closed), when it expires.
 */

export const TRADE_STATUSES = ['open', 'accepted', 'declined', 'withdrawn', 'expired'] as const
export type TradeStatus = (typeof TRADE_STATUSES)[number]

/** Most heroes from each side in one offer */
export const TRADE_MAX_HEROES = 3
/** Most open offers one party may have sent */
export const TRADE_MAX_OPEN = 10

const heroIds = { type: [{ type: Schema.Types.ObjectId, ref: 'Hero' }], required: true, immutable: true }

const tradeSchema = new Schema(
  {
    leagueId: { type: Schema.Types.ObjectId, ref: 'League', required: true, immutable: true },
    fromPartyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true, immutable: true },
    toPartyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true, immutable: true },
    // The sender's heroes, and the heroes asked for in return
    offered: heroIds,
    requested: heroIds,
    // Released to free agency to stay within the roster size: the sender's when offering, the other party's on accepting
    fromReleases: { type: [{ type: Schema.Types.ObjectId, ref: 'Hero' }], default: [], immutable: true },
    toReleases: { type: [{ type: Schema.Types.ObjectId, ref: 'Hero' }], default: [] },
    status: { type: String, required: true, enum: TRADE_STATUSES, default: 'open' },
    answeredAt: { type: Date, default: null },
    // Accepted: the first game week the trade counts for
    effectiveWeek: { type: Number, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)
tradeSchema.index({ leagueId: 1, status: 1 })
tradeSchema.index({ toPartyId: 1, status: 1 })
tradeSchema.index({ fromPartyId: 1, status: 1 })

export type Trade = InferSchemaType<typeof tradeSchema>
export type TradeDocument = HydratedDocument<Trade>

export const TradeModel = model('Trade', tradeSchema)
