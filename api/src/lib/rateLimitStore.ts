import mongoose from 'mongoose'
import type { IncrementResponse, Options, Store } from 'express-rate-limit'

/*
 * Rate-limit counters kept in MongoDB, so every running copy of the API shares them. On a serverless
 * host several short-lived instances serve requests at once; with in-memory counters each would count
 * separately and a PIN guesser could spread attempts across them. Expired windows are removed by a TTL
 * index, so the collection stays small.
 */

interface Counter {
  _id: string
  hits: number
  resetAt: Date
}

const COLLECTION = 'ratelimits'

export class MongoRateLimitStore implements Store {
  /** Shared counters across instances */
  readonly localKeys = false
  private windowMs = 60_000

  constructor(readonly prefix: string) {}

  private get counters() {
    // The native collection: these are internal counters, not schema documents.
    return mongoose.connection.collection<Counter>(COLLECTION)
  }

  init(options: Options): void {
    this.windowMs = options.windowMs
    // Mongo deletes a counter once its window has passed (checked about once a minute).
    void this.counters.createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 }).catch(() => undefined)
  }

  /** Counts a hit atomically, starting a new window when the old one has passed. */
  async increment(key: string): Promise<IncrementResponse> {
    const now = new Date()
    const live = { $gt: ['$resetAt', now] }
    const counter = await this.counters.findOneAndUpdate(
      { _id: this.prefix + key },
      [
        {
          $set: {
            hits: { $cond: [live, { $add: ['$hits', 1] }, 1] },
            resetAt: { $cond: [live, '$resetAt', new Date(now.getTime() + this.windowMs)] }
          }
        }
      ],
      { upsert: true, returnDocument: 'after' }
    )
    if (!counter) throw new Error('Rate limit counter was not written')
    return { totalHits: counter.hits, resetTime: counter.resetAt }
  }

  async get(key: string): Promise<IncrementResponse | undefined> {
    const counter = await this.counters.findOne({ _id: this.prefix + key })
    if (!counter || counter.resetAt <= new Date()) return undefined
    return { totalHits: counter.hits, resetTime: counter.resetAt }
  }

  async decrement(key: string): Promise<void> {
    await this.counters.updateOne({ _id: this.prefix + key, hits: { $gt: 0 } }, { $inc: { hits: -1 } })
  }

  async resetKey(key: string): Promise<void> {
    await this.counters.deleteOne({ _id: this.prefix + key })
  }
}
