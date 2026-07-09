// ─── Easy RFID Pro HTTP client — SERVER-ONLY, sandbox-guarded ────────────────
// Credentials live here; never import from client components. The wire
// contract below was reverse-engineered live against the production API
// (partytime-rfid docs/api-rfid.md + lessons.md, sessions 6+8):
//   • auth failures arrive as HTTP 200 wrapping a 401 body
//   • writes are POST {operation:{upsert:[rows]}} — the flat PATCH shape is a
//     silent no-op
//   • write failures are HTTP 200 — success ⇔ result.success && failed_count 0
//   • filter[] = field,operator,'value' (single quotes)
//
// GUARDRAIL (session-binding, see CLAUDE.md): writes go ONLY to the sandbox
// host resolved from EASY_RFID_BASE_URL. Any other host requires the explicit
// EASY_RFID_ALLOW_PRODUCTION flag — not set this session. The resolved host is
// asserted + logged once at startup so every run states where writes go.

import { TagBackendError } from '../ports/tagBackend'

export const SANDBOX_HOST = 'sb-easyrfidpro.ptshome.com'
const DEFAULT_BASE_URL = `https://${SANDBOX_HOST}`
/** Production Item Master table UUID (docs/api-rfid.md). The sandbox's may differ — see ASSUMPTIONS.md. */
const DEFAULT_ITEM_MASTER_PATH = '/api/v1/data/14223767938169344381'

const REQUEST_TIMEOUT_MS = 10_000
const TOKEN_MAX_AGE_MS = 55 * 60 * 1000 // TTL is 60 min; refresh proactively

export interface EzrfidClientOptions {
  /** Defaults from EASY_RFID_BASE_URL, else the sandbox. Never hardcode a host at a call site. */
  baseUrl?: string
  /** Login host. Defaults from EASY_RFID_AUTH_URL, else the base URL (sandbox login path unverified — ASSUMPTIONS.md). */
  authUrl?: string
  itemMasterPath?: string
  username?: string
  password?: string
  /** The production-write escape hatch. NOT set this session. */
  allowProduction?: boolean
  fetchImpl?: typeof fetch
  now?: () => number
}

function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  return url
}

export function itemMasterWriteBody(rows: Record<string, string>[]): {
  operation: { upsert: Record<string, string>[] }
} {
  return { operation: { upsert: rows } }
}

/** Success ⇔ result.success === true AND failed_count === 0. res.ok is NOT enough. */
export function isWriteSuccess(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false
  const obj = json as { result?: { success?: boolean }; failed_count?: number }
  return obj.result?.success === true && (obj.failed_count ?? 0) === 0
}

export function extractRows<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[]
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>
    for (const key of ['data', 'records', 'rows', 'result']) {
      if (Array.isArray(obj[key])) return obj[key] as T[]
    }
  }
  return []
}

let hostAsserted = false

export class EzrfidClient {
  private readonly baseUrl: string
  private readonly authUrl: string
  private readonly itemMasterPath: string
  private readonly username: string | undefined
  private readonly password: string | undefined
  private readonly allowProduction: boolean
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number

  private token: string | null = null
  private tokenIssuedAt = 0
  private authInFlight: Promise<string> | null = null

  constructor(opts: EzrfidClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(opts.baseUrl ?? process.env.EASY_RFID_BASE_URL ?? DEFAULT_BASE_URL)
    this.authUrl = normalizeBaseUrl(opts.authUrl ?? process.env.EASY_RFID_AUTH_URL ?? this.baseUrl)
    this.itemMasterPath = opts.itemMasterPath ?? process.env.EASY_RFID_ITEM_MASTER_PATH ?? DEFAULT_ITEM_MASTER_PATH
    this.username = opts.username ?? process.env.EASY_RFID_USERNAME
    this.password = opts.password ?? process.env.EASY_RFID_PASSWORD
    this.allowProduction = opts.allowProduction ?? process.env.EASY_RFID_ALLOW_PRODUCTION === 'true'
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.now = opts.now ?? (() => Date.now())
    this.assertHostOnce()
  }

  get resolvedHost(): string {
    return new URL(this.baseUrl).host
  }

  get isSandbox(): boolean {
    return this.resolvedHost === SANDBOX_HOST
  }

  /** Every run states out loud where its writes are going. */
  private assertHostOnce(): void {
    if (hostAsserted) return
    hostAsserted = true
    const mode = this.isSandbox
      ? 'SANDBOX'
      : this.allowProduction
        ? 'PRODUCTION (explicitly allowed via EASY_RFID_ALLOW_PRODUCTION)'
        : 'NON-SANDBOX — WRITES WILL BE REFUSED'
    console.info(`[rfid] Easy RFID Pro base: ${this.resolvedHost} [${mode}]`)
  }

  /** The guardrail. Called before every write; throws TagBackendError('guard'). */
  assertWriteAllowed(): void {
    if (this.isSandbox || this.allowProduction) return
    throw new TagBackendError(
      `write refused: resolved host ${this.resolvedHost} is not the sandbox (${SANDBOX_HOST}) ` +
        'and EASY_RFID_ALLOW_PRODUCTION is not set',
      'guard',
    )
  }

  // ── Auth (token TTL 60 min; wrapped-401 gotcha) ────────────────────────────

  private async getToken(): Promise<string> {
    if (this.token && this.now() - this.tokenIssuedAt < TOKEN_MAX_AGE_MS) return this.token
    if (!this.authInFlight) {
      this.authInFlight = this.login().finally(() => {
        this.authInFlight = null
      })
    }
    return this.authInFlight
  }

  private invalidateToken(): void {
    this.token = null
    this.tokenIssuedAt = 0
  }

  private async login(): Promise<string> {
    if (!this.username || !this.password) {
      throw new TagBackendError('EASY_RFID_USERNAME / EASY_RFID_PASSWORD not set', 'auth')
    }
    let res: Response
    try {
      res = await this.fetchImpl(`${this.authUrl}/api/v1/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username, password: this.password }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      })
    } catch {
      // Never leak credentials or upstream error bodies into messages.
      throw new TagBackendError('login request failed (network/timeout)', 'network')
    }
    if (!res.ok) throw new TagBackendError(`login rejected (${res.status})`, 'auth')
    const data = (await res.json().catch(() => null)) as { access_token?: string } | null
    if (!data?.access_token) throw new TagBackendError('login response missing access_token', 'auth')
    this.token = data.access_token
    this.tokenIssuedAt = this.now()
    return this.token
  }

  /** Wrapped-401 detection: gateway returns HTTP 200 with a CURL 401 message inside. */
  private async isAuthFailure(res: Response): Promise<boolean> {
    if (res.status === 401) return true
    if (res.status !== 200) return false
    try {
      const body = (await res.clone().json()) as {
        result?: { success?: boolean; message?: string }
      } | null
      return (
        body?.result?.success === false &&
        typeof body.result.message === 'string' &&
        body.result.message.includes('Invalid user or API token')
      )
    } catch {
      return false
    }
  }

  // ── Authenticated fetch (401-retry-once, 10s timeout, no 5xx retry) ───────

  private async authedFetch(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const doFetch = async (bearer: string): Promise<Response> => {
      try {
        return await this.fetchImpl(url, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
            Authorization: `Bearer ${bearer}`,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: 'no-store',
        })
      } catch {
        throw new TagBackendError('request failed (network or >10s timeout)', 'network')
      }
    }

    let res = await doFetch(await this.getToken())
    if (await this.isAuthFailure(res)) {
      this.invalidateToken()
      res = await doFetch(await this.getToken())
      if (await this.isAuthFailure(res)) {
        this.invalidateToken()
        throw new TagBackendError('still auth-rejected after one re-authentication', 'auth')
      }
    }
    if (res.status >= 500) {
      throw new TagBackendError(`upstream returned ${res.status}`, 'network')
    }
    return res
  }

  // ── Item Master ops ───────────────────────────────────────────────────────

  /** Paged GET of the full Item Master. */
  async fetchItemMasterRows(pageSize = 1000): Promise<Record<string, string>[]> {
    const rows: Record<string, string>[] = []
    let offset = 0
    for (;;) {
      const res = await this.authedFetch(
        `${this.itemMasterPath}?limit=${pageSize}&offset=${offset}`,
        { method: 'GET' },
      )
      const json = await res.json().catch(() => null)
      const page = extractRows<Record<string, string>>(json)
      rows.push(...page)
      if (page.length < pageSize) return rows
      offset += page.length
    }
  }

  /** Upsert Item Master rows (ONE call, N rows). Body-checked; guard-checked. */
  async upsertItemMasterRows(rows: Record<string, string>[]): Promise<{ ok: boolean; raw: unknown }> {
    this.assertWriteAllowed()
    const res = await this.authedFetch(this.itemMasterPath, {
      method: 'POST',
      body: JSON.stringify(itemMasterWriteBody(rows)),
    })
    const json = await res.json().catch(() => null)
    return { ok: isWriteSuccess(json), raw: json }
  }
}

/** Test hook: allow the host-assertion log to fire again (fresh construction). */
export function __resetHostAssertionForTests(): void {
  hostAsserted = false
}
