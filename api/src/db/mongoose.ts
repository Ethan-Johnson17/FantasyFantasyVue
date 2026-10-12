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

const DUPLICATE_KEY = 11000

/**
 * True for a unique-index violation. Pass `field` to check which index was violated
 * (it must be one of the index's keys).
 */
export function isDuplicateKeyError(error: unknown, field?: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== DUPLICATE_KEY) return false
  if (field === undefined) return true
  const keyPattern = 'keyPattern' in error ? error.keyPattern : undefined
  return typeof keyPattern === 'object' && keyPattern !== null && field in keyPattern
}
