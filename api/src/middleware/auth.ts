import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { auth, type AuthOptions } from 'express-oauth2-jwt-bearer'
import type { Env } from '../config/env.js'
import { Unauthorized } from '../lib/errors.js'
import type { AccountDocument } from '../modules/accounts/account.model.js'
import { findOrCreateAccount } from '../modules/accounts/account.service.js'

declare module 'express-serve-static-core' {
  interface Request {
    account?: AccountDocument
  }
}

/** Validates Auth0-issued access tokens (signature, issuer, audience, expiry). */
export function auth0Authenticator(env: Pick<Env, 'AUTH0_DOMAIN' | 'AUTH0_AUDIENCE'>): RequestHandler {
  return jwtAuthenticator({
    issuerBaseURL: `https://${env.AUTH0_DOMAIN}/`,
    audience: env.AUTH0_AUDIENCE
  })
}

export function jwtAuthenticator(options: AuthOptions): RequestHandler {
  return auth(options)
}

/** Runs after token validation: attaches the caller's account, creating it on first login. */
export async function loadAccount(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const sub = req.auth?.payload.sub
  if (!sub) throw new Unauthorized()
  req.account = await findOrCreateAccount(sub)
  next()
}

/** Returns the authenticated caller's account. Only valid on routes behind loadAccount. */
export function currentAccount(req: Request): AccountDocument {
  if (!req.account) throw new Unauthorized()
  return req.account
}
