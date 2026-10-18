import { z } from 'zod'

const commaList = z
  .string()
  .transform(value => value.split(',').map(item => item.trim()).filter(Boolean))

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'must be a MongoDB connection string'),
  // Connections per running instance. Keep it small on serverless hosts, where many instances can run at once.
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_AUDIENCE: z.string().min(1),
  CORS_ORIGINS: commaList.default([]),
  // Number of reverse proxies in front of the API (0 locally; usually 1 on a hosting platform).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0)
})

export type Env = z.infer<typeof EnvSchema>

/**
 * Validates environment variables once at startup so misconfiguration fails fast
 * instead of surfacing as confusing runtime errors.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    // Only report which variables are invalid; never echo their values.
    const problems = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Invalid environment configuration:\n  ${problems.join('\n  ')}`)
  }
  return result.data
}
