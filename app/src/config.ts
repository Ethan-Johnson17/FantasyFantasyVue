export interface AppConfig {
  apiUrl: string
  auth0: { domain: string; clientId: string; audience: string }
}

/** Reads build-time settings, failing fast with a clear message if any are missing. */
export function loadConfig(env: ImportMetaEnv = import.meta.env): AppConfig {
  const missing = (['VITE_AUTH0_DOMAIN', 'VITE_AUTH0_CLIENT_ID', 'VITE_AUTH0_AUDIENCE'] as const).filter(key => !env[key])
  if (missing.length) throw new Error(`Missing app settings: ${missing.join(', ')}. See app/.env.example.`)
  return {
    apiUrl: env.VITE_API_URL ?? 'http://localhost:3000',
    auth0: { domain: env.VITE_AUTH0_DOMAIN, clientId: env.VITE_AUTH0_CLIENT_ID, audience: env.VITE_AUTH0_AUDIENCE }
  }
}
