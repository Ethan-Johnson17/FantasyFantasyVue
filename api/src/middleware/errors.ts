import type { ErrorRequestHandler, RequestHandler } from 'express'
import { UnauthorizedError } from 'express-oauth2-jwt-bearer'
import type { Logger } from 'pino'
import { ZodError } from 'zod'
import { HttpError, NotFound } from '../lib/errors.js'

interface ErrorBody {
  error: { status: number; message: string; issues?: { path: string; message: string }[] }
}

export const notFound: RequestHandler = () => {
  throw new NotFound()
}

/**
 * Converts any thrown error into a JSON response. Only errors known to be safe
 * expose their message; everything else becomes a generic 500 and is logged.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    const { status, body, headers } = toResponse(error)
    if (status >= 500) logger.error({ err: error }, 'Unhandled error')
    if (headers) res.set(headers)
    res.status(status).json(body)
  }
}

function toResponse(error: unknown): { status: number; body: ErrorBody; headers?: Record<string, string> } {
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: { status: error.status, message: error.message } } }
  }
  if (error instanceof ZodError) {
    const issues = error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }))
    return { status: 400, body: { error: { status: 400, message: 'Invalid request', issues } } }
  }
  if (error instanceof UnauthorizedError) {
    // Token problems: keep the standard WWW-Authenticate header but not library-specific detail.
    return {
      status: error.status,
      body: { error: { status: error.status, message: 'Unauthorized' } },
      headers: error.headers
    }
  }
  if (isExposableClientError(error)) {
    // body-parser errors (malformed JSON, payload too large) are flagged safe to expose.
    return { status: error.status, body: { error: { status: error.status, message: error.message } } }
  }
  return { status: 500, body: { error: { status: 500, message: 'Internal Server Error' } } }
}

function isExposableClientError(error: unknown): error is { status: number; message: string } {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { status?: unknown; expose?: unknown; message?: unknown }
  return (
    candidate.expose === true &&
    typeof candidate.status === 'number' &&
    candidate.status >= 400 &&
    candidate.status < 500 &&
    typeof candidate.message === 'string'
  )
}
