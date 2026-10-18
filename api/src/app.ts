import cors from 'cors'
import express, { type RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import type { Logger } from 'pino'
import type { Env } from './config/env.js'
import { loadAccount } from './middleware/auth.js'
import { MongoRateLimitStore } from './lib/rateLimitStore.js'
import { errorHandler, notFound } from './middleware/errors.js'
import { accountRouter } from './modules/accounts/account.routes.js'
import { leagueRouter, partyRouter } from './modules/leagues/league.routes.js'
import { healthRouter } from './routes/health.js'
import { rulesRouter } from './routes/rules.js'

export interface AppDependencies {
  env: Pick<Env, 'CORS_ORIGINS' | 'TRUST_PROXY_HOPS'>
  logger: Logger
  /** Validates the bearer token and populates req.auth. Injected so tests can use a local signing key. */
  authenticate: RequestHandler
}

export function createApp({ env, logger, authenticate }: AppDependencies) {
  const app = express()

  // Needed behind a hosting proxy so rate limiting sees real client IPs instead of the proxy's.
  app.set('trust proxy', env.TRUST_PROXY_HOPS)

  app.use(
    pinoHttp({
      logger,
      // Keep request logs short, and mask league PINs: they are access codes for private leagues.
      serializers: {
        req: (req: { method?: string; url?: string }) => ({ method: req.method, url: maskPins(req.url ?? '') }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode })
      }
    })
  )
  app.use(helmet())
  // Auth uses bearer tokens, not cookies, so credentialed CORS is unnecessary.
  app.use(cors({ origin: env.CORS_ORIGINS }))
  app.use(express.json({ limit: '100kb' }))
  // Counters live in MongoDB so every running copy of the API shares them (see lib/rateLimitStore.ts).
  app.use(
    rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, store: new MongoRateLimitStore('ip:') })
  )

  app.use('/health', healthRouter)
  // Public, so the rules can be read before signing in. Mounted ahead of the authenticated API.
  app.use('/api/rules', rulesRouter)

  const api = express.Router()
  api.use(authenticate, loadAccount)
  api.use('/account', accountRouter)
  api.use('/leagues', leagueRouter())
  api.use('/parties', partyRouter)
  app.use('/api', api)

  app.use(notFound)
  app.use(errorHandler(logger))
  return app
}

export function maskPins(url: string): string {
  return url.replace(/\/pin\/[^/?#]+/gi, '/pin/[redacted]')
}
