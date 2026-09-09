/**
 * FIDScript REST client — platform-agnostic HTTP transport.
 *
 * Used by Desktop (Electron main process), Mobile (React Native),
 * and Web (browser fetch). All three call into the same SDK functions.
 *
 * Should NOT contain any platform-specific code (no electron, no react-native).
 */

import { FIDSCRIPT_API_BASE, CloudError, NetworkError, ValidationError } from '@soostori/core'

export interface CloudClientOptions {
  appId: string
  /** Optional auth token (cloud session). */
  token?: string
  /** Optional fetch override for testing. */
  fetch?: typeof fetch
  /** Request timeout in ms (default 30000). */
  timeoutMs?: number
}

export class CloudClient {
  private readonly appId: string
  private _token: string | undefined
  private readonly fetch: typeof fetch
  private readonly timeoutMs: number

  constructor(options: CloudClientOptions) {
    if (!options.appId) throw new Error('appId is required')
    this.appId = options.appId
    this._token = options.token
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  /** Set the auth token for subsequent requests. */
  setToken(token: string | undefined): void {
    this._token = token
  }

  getToken(): string | undefined {
    return this._token
  }

  private url(path: string): string {
    return `${FIDSCRIPT_API_BASE}${path}`
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this._token) h.Authorization = `Bearer ${this._token}`
    return h
  }

  /** Issue an HTTP request with timeout. */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetch(this.url(path), {
        method,
        headers: this.headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new CloudError(
          `Cloud request failed: ${res.status} ${res.statusText}`,
          'CLOUD_REQUEST_FAILED',
          res.status,
          errBody
        )
      }
      return res.json() as Promise<T>
    } catch (err) {
      if (err instanceof CloudError) throw err
      if ((err as Error).name === 'AbortError') {
        throw new NetworkError(`Cloud request timed out after ${this.timeoutMs}ms`)
      }
      throw new NetworkError(`Cloud request failed: ${(err as Error).message}`, 'NETWORK_UNAVAILABLE', err)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // ── Auth ────────────────────────────────────────────────────────────

  /** Sign out — invalidates the current cloud session. */
  async signOut(): Promise<void> {
    if (!this._token) return
    await this.request('POST', `/api/v1/apps/${this.appId}/auth/sign-out`)
  }

  // ── InstaQL queries ────────────────────────────────────────────────

  /** Query cloud entities using InstaQL. */
  async query<T = Record<string, unknown>>(goals: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', `/api/v1/apps/${this.appId}/instaql/query`, { goals })
  }

  // ── Instaml transactions ───────────────────────────────────────────

  /** Execute a transaction (create/update/delete). */
  async transact(steps: unknown[][]): Promise<Record<string, unknown>> {
    return this.request('POST', `/api/v1/apps/${this.appId}/instaml/tx`, { steps })
  }

  // ── Entity helpers (typed) ──────────────────────────────────────────

  /** Create or update an entity by ID. */
  async upsert(entityName: string, entityId: string, attrs: Record<string, unknown>): Promise<void> {
    const { validateEntity } = await import('@soostori/schema')
    try {
      validateEntity(entityName, { ...attrs, id: entityId })
    } catch (err) {
      throw new ValidationError(`Invalid ${entityName} record`, 'VALIDATION_FAILED', err)
    }
    await this.transact([['update', entityName, entityId, attrs]])
  }

  /** Get an entity by ID. */
  async getById<T = Record<string, unknown>>(entityName: string, id: string): Promise<T | null> {
    const result = await this.query<Record<string, unknown[]>>({ [entityName]: { $: { where: { id } } } })
    const list = (result[entityName] as Record<string, unknown>[]) ?? []
    return (list[0] as T) ?? null
  }

  /** Health check. */
  async health(): Promise<{ reachable: boolean; latencyMs: number | null }> {
    const t0 = performance.now()
    try {
      await this.request('GET', `/api/v1/apps/${this.appId}`)
      return { reachable: true, latencyMs: Math.round(performance.now() - t0) }
    } catch {
      return { reachable: false, latencyMs: null }
    }
  }
}

/** Factory: create a new cloud client. */
export function createCloudClient(opts: CloudClientOptions): CloudClient {
  return new CloudClient(opts)
}
