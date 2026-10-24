/**
 * Imports nflverse weekly stats into MongoDB.
 *
 *   npm run import:stats -- --seasons 2011-2025
 *   npm run import:stats -- --seasons 2023
 *   npm run import:stats -- --seasons current   (the season in progress; what the scheduled workflow runs)
 */
import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { loadScriptEnv } from '../config/env.js'
import { configureMongoose } from '../db/mongoose.js'
import { createLogger } from '../lib/logger.js'
import { importSeasons } from '../modules/stats/importer.js'
import { currentNflSeason, parseSeasonRange } from '../modules/stats/seasons.js'

const { values } = parseArgs({ options: { seasons: { type: 'string' } } })
if (!values.seasons) throw new Error('Missing --seasons (e.g. --seasons 2011-2025, or current)')
const seasons = values.seasons === 'current' ? [currentNflSeason()] : parseSeasonRange(values.seasons)

const env = loadScriptEnv()
const logger = createLogger(env)
configureMongoose()
await mongoose.connect(env.MONGODB_URI)
try {
  await mongoose.connection.syncIndexes()
  for (const result of await importSeasons(seasons)) logger.info(result, 'Imported season')
} finally {
  await mongoose.disconnect()
}
