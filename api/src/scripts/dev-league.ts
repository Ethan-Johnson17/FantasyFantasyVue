/**
 * Development-only helper for trying a league solo. Refuses to run unless NODE_ENV=development.
 *
 *   npm run dev:league -- --pin K7QX4M --add-bots 3   add bot parties (league must be forming)
 *   npm run dev:league -- --pin K7QX4M --run-draft    make a scheduled draft due now
 *   npm run dev:league -- --pin K7QX4M --weeks-due 3  fast-forward so the next 3 weeks resolve
 *
 * Changes take effect the next time anyone opens the league, exactly as in normal play.
 */
import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { loadEnv } from '../config/env.js'
import { configureMongoose } from '../db/mongoose.js'
import { findOrCreateAccount } from '../modules/accounts/account.service.js'
import { CREST_BANNERS, CREST_EMBLEMS } from '../modules/leagues/crests.js'
import { CADENCE_MS, LeagueModel } from '../modules/leagues/league.model.js'
import { joinLeague } from '../modules/leagues/league.service.js'

const env = loadEnv()
if (env.NODE_ENV !== 'development') throw new Error('dev:league only runs with NODE_ENV=development')

const { values } = parseArgs({
  options: {
    pin: { type: 'string' },
    'add-bots': { type: 'string' },
    'run-draft': { type: 'boolean' },
    'weeks-due': { type: 'string' }
  }
})
const pin = values.pin?.trim().toUpperCase()
if (!pin) throw new Error('Missing --pin')

configureMongoose()
await mongoose.connect(env.MONGODB_URI)
try {
  const league = await LeagueModel.findOne({ pin })
  if (!league) throw new Error(`No league with PIN ${pin}`)

  if (values['add-bots']) {
    const count = Number(values['add-bots'])
    if (!Number.isInteger(count) || count < 1 || count > 5) throw new Error('--add-bots must be 1-5')
    for (let i = 0; i < count; i++) {
      const bot = await findOrCreateAccount(`dev-bot|${pin}-${String(league.partyCount + i)}`)
      const n = league.partyCount + i
      await joinLeague(bot, pin, {
        name: `Bot Party ${String(n)}`,
        crest: { emblem: CREST_EMBLEMS[n % CREST_EMBLEMS.length] ?? 'crown', banner: CREST_BANNERS[n % CREST_BANNERS.length] ?? 'crimson' }
      })
      console.log(`Added Bot Party ${String(n)}`)
    }
  }

  if (values['run-draft']) {
    const due = await LeagueModel.updateOne({ _id: league._id, status: 'drafting' }, { $set: { draftAt: new Date(Date.now() - 1000) } })
    console.log(due.modifiedCount ? 'Draft is now due; open the league to run it.' : 'No scheduled draft to run.')
  }

  if (values['weeks-due']) {
    const weeks = Number(values['weeks-due'])
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 14) throw new Error('--weeks-due must be 1-14')
    const fresh = await LeagueModel.findById(league._id)
    if (fresh?.status !== 'active' || !fresh.weekOneAt) throw new Error('The league has no season in progress')
    // Shift week 1 back so that `weeks` more weeks are due right now.
    const cadence = CADENCE_MS[fresh.cadence]
    const lastDue = fresh.resolvedWeeks + weeks
    await LeagueModel.updateOne({ _id: fresh._id }, { $set: { weekOneAt: new Date(Date.now() - (lastDue - 1) * cadence - 60_000) } })
    console.log(`Weeks ${String(fresh.resolvedWeeks + 1)}-${String(Math.min(lastDue, 14))} are due; open the league to resolve them.`)
  }
} finally {
  await mongoose.disconnect()
}
