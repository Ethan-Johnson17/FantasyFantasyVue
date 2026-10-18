import mongoose from 'mongoose'
import { loadEnv } from './config/env.js'
import { configureMongoose } from './db/mongoose.js'
import { createLogger } from './lib/logger.js'
import { auth0Authenticator } from './middleware/auth.js'
import { createServerlessApp } from './serverless.js'

/*
 * Entry point on Vercel (loaded by api/index.js after the build). Local development keeps using
 * src/server.ts, a regular long-running server.
 */

const env = loadEnv()
const logger = createLogger(env)
configureMongoose()

export default createServerlessApp({
  env,
  logger,
  authenticate: auth0Authenticator(env),
  // A small pool per instance: many instances can run at once, and the free Atlas tier caps connections.
  connect: () => mongoose.connect(env.MONGODB_URI, { maxPoolSize: env.MONGODB_MAX_POOL_SIZE })
})
