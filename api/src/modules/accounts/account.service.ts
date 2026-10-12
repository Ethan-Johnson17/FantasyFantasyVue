import { z } from 'zod'
import { isDuplicateKeyError } from '../../db/mongoose.js'
import { AccountModel, DISPLAY_NAME_MAX, type AccountDocument } from './account.model.js'

/**
 * Returns the account for an Auth0 subject, creating it on first login.
 * Uses an atomic upsert so concurrent first requests can't create duplicates.
 */
export async function findOrCreateAccount(authSub: string): Promise<AccountDocument> {
  const upsert = () =>
    AccountModel.findOneAndUpdate(
      { authSub },
      { $setOnInsert: { authSub } },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
    ).orFail()

  try {
    return await upsert()
  } catch (error) {
    // Two simultaneous upserts can race on the unique index; the loser retries and finds the winner's doc.
    if (isDuplicateKeyError(error)) return upsert()
    throw error
  }
}

export const AccountUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX),
    picture: z.url({ protocol: /^https$/ }).max(500)
  })
  .partial()
  .strict()

export type AccountUpdate = z.infer<typeof AccountUpdateSchema>

export async function updateAccount(account: AccountDocument, update: AccountUpdate): Promise<AccountDocument> {
  account.set(update)
  return account.save()
}
