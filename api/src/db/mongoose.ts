import mongoose from 'mongoose'

/**
 * Global Mongoose safety settings. Call once before connecting.
 * - sanitizeFilter: strips query operators like `$ne` from filter values, blocking NoSQL injection.
 * - strictQuery: ignores filter fields that aren't in the schema.
 */
export function configureMongoose(): void {
  mongoose.set('sanitizeFilter', true)
  mongoose.set('strictQuery', true)
}

/**
 * Shared toJSON settings: expose `id` instead of `_id` and drop internal fields.
 * Schemas can pass extra field names that must never leave the server.
 */
export function jsonOptions(hiddenFields: readonly string[] = []) {
  const hidden = new Set(['_id', ...hiddenFields])
  return {
    virtuals: true,
    versionKey: false,
    transform(_doc: unknown, ret: Record<string, unknown>) {
      return Object.fromEntries(Object.entries(ret).filter(([key]) => !hidden.has(key)))
    }
  }
}
