import { inject, type InjectionKey } from 'vue'
import type { ApiClient } from './client'

/** Components get the API through injection, so tests can provide a fake. */
export const apiKey: InjectionKey<ApiClient> = Symbol('api')

export function useApi(): ApiClient {
  const api = inject(apiKey)
  if (!api) throw new Error('API client was not provided')
  return api
}
