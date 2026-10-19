import mongoose from 'mongoose'
import { createApp } from './createApp.js'
import { loadEnv } from './config/env.js'
import { configureMongoose } from './db/mongoose.js'
import { createLogger } from './lib/logger.js'
import { auth0Authenticator } from './middleware/auth.js'

const env = loadEnv()
const logger = createLogger(env)

configureMongoose()
await mongoose.connect(env.MONGODB_URI, { maxPoolSize: env.MONGODB_MAX_POOL_SIZE })
logger.info('Connected to MongoDB')

const app = createApp({ env, logger, authenticate: auth0Authenticator(env) })
const server = app.listen(env.PORT, () => {
  logger.info(`API listening on port ${String(env.PORT)}`)
})

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down`)
  server.close()
  await mongoose.disconnect()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
