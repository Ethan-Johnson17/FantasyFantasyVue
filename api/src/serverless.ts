import express, { type Express } from 'express'
import { createApp, type AppDependencies } from './app.js'
import { HttpError } from './lib/errors.js'
import { errorHandler } from './middleware/errors.js'

/*
 * The API as a serverless function (Vercel). Instances start on demand and may serve many requests,
 * so the database connection is opened on the first request and reused after that. A failed
 * connection is retried on the next request instead of leaving the instance broken.
 */

export interface ServerlessDependencies extends AppDependencies {
  /** Opens the database connection (called at most once while it succeeds) */
  connect: () => Promise<unknown>
}

export function createServerlessApp({ connect, ...app }: ServerlessDependencies): Express {
  let connecting: Promise<unknown> | null = null
  const connectOnce = () => {
    connecting ??= connect().catch((error: unknown) => {
      connecting = null // Try again on the next request.
      throw error
    })
    return connecting
  }

  const server = express()
  server.disable('x-powered-by')
  server.set('trust proxy', app.env.TRUST_PROXY_HOPS)
  server.use((_req, _res, next) => {
    connectOnce().then(
      () => {
        next()
      },
      (error: unknown) => {
        app.logger.error({ err: error }, 'Database connection failed')
        next(new HttpError(503, 'The server is having trouble reaching its database. Please try again shortly.'))
      }
    )
  })
  server.use(createApp(app))
  server.use(errorHandler(app.logger))
  return server
}
