import type { Account, CreateLeagueInput, LeagueDetail, LeagueSummary, MyLeague, PartyInput } from './types'

/** An API error with the server's safe, human-readable message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: { path: string; message: string }[] = []
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export type TokenProvider = () => Promise<string>
type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface ApiClient {
  getAccount(): Promise<Account>
  updateAccount(update: { displayName?: string; picture?: string }): Promise<Account>
  listMyLeagues(): Promise<MyLeague[]>
  getLeague(id: string): Promise<LeagueDetail>
  createLeague(input: CreateLeagueInput): Promise<LeagueDetail>
  previewLeague(pin: string): Promise<LeagueSummary>
  joinLeague(pin: string, party: PartyInput): Promise<LeagueDetail>
}

export function createApiClient(baseUrl: string, getToken: TokenProvider, fetchImpl: FetchLike = fetch): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await getToken()}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    if (response.status === 204) return undefined as T
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) throw toApiError(response.status, payload)
    return payload as T
  }

  const segment = (value: string) => encodeURIComponent(value)

  return {
    getAccount: () => request('GET', '/api/account'),
    updateAccount: update => request('PATCH', '/api/account', update),
    listMyLeagues: () => request('GET', '/api/leagues/mine'),
    getLeague: id => request('GET', `/api/leagues/${segment(id)}`),
    createLeague: input => request('POST', '/api/leagues', input),
    previewLeague: pin => request('GET', `/api/leagues/pin/${segment(pin)}`),
    joinLeague: (pin, party) => request('POST', '/api/leagues/join', { pin, party })
  }
}

function toApiError(status: number, payload: unknown): ApiError {
  const error = (payload as { error?: { message?: unknown; issues?: unknown } } | null)?.error
  const message = typeof error?.message === 'string' ? error.message : 'Something went wrong. Please try again.'
  const issues = Array.isArray(error?.issues) ? (error.issues as { path: string; message: string }[]) : []
  return new ApiError(status, message, issues)
}
