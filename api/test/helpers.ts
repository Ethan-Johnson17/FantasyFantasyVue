import { SignJWT } from 'jose'
import { createApp } from '../src/createApp.js'
import { createLogger } from '../src/lib/logger.js'
import { jwtAuthenticator } from '../src/middleware/auth.js'

const ISSUER = 'https://test-issuer.example/'
const AUDIENCE = 'https://fantasyfantasy.test/api'
const SECRET = 'test-only-signing-secret-at-least-32-bytes!'

/**
 * Builds the real app, with token validation pointed at a local HS256 key instead of Auth0. Crossover and Co-op
 * are on, so their tests can create leagues; production keeps a mode off until it's finished.
 */
export function buildTestApp({ crossoverEnabled = true, coopEnabled = true }: { crossoverEnabled?: boolean; coopEnabled?: boolean } = {}) {
  return createApp({
    env: { CORS_ORIGINS: ['http://localhost:8080'], TRUST_PROXY_HOPS: 0, CROSSOVER_ENABLED: crossoverEnabled, COOP_ENABLED: coopEnabled },
    logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    authenticate: jwtAuthenticator({ issuer: ISSUER, audience: AUDIENCE, secret: SECRET, tokenSigningAlg: 'HS256' })
  })
}

interface TokenOptions {
  audience?: string
  expiresIn?: string
  secret?: string
}

export async function signToken(sub: string, options: TokenOptions = {}): Promise<string> {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '5m')
    .sign(new TextEncoder().encode(options.secret ?? SECRET))
  return `Bearer ${jwt}`
}
