import { pino, type Logger } from 'pino'
import type { Env } from '../config/env.js'

export function createLogger(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Logger {
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    // Never log credentials, even if a future log statement includes request headers.
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {})
  })
}
