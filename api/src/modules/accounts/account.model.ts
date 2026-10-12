import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { jsonOptions } from '../../db/mongoose.js'

export const DISPLAY_NAME_MAX = 40

const accountSchema = new Schema(
  {
    // Auth0 subject (e.g. "auth0|abc123"). This is the stable identity; never sent to clients.
    authSub: { type: String, required: true, unique: true, immutable: true },
    displayName: { type: String, required: true, trim: true, maxlength: DISPLAY_NAME_MAX, default: 'Adventurer' },
    picture: { type: String, maxlength: 500 }
  },
  { timestamps: true, toJSON: jsonOptions(['authSub']) }
)

export type Account = InferSchemaType<typeof accountSchema>
export type AccountDocument = HydratedDocument<Account>

export const AccountModel = model('Account', accountSchema)
