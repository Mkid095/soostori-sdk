/**
 * Viventure client — the company's own WhatsApp platform.
 *
 * WHY THIS EXISTS ALONGSIDE THE EVOLUTION CLIENT
 * ----------------------------------------------
 * Evolution is a self-hosted gateway: you run it, you own the instance, and
 * there is no third-party token. Viventure is the platform the company now
 * runs: accounts own projects, projects own instances (one WhatsApp session
 * per phone number), and the same backend answers over REST, MCP and the CLI.
 *
 * The distinction matters for the product: a shop owner connects THEIR OWN
 * number as THEIR OWN instance, so there is one instance per shop rather than
 * one instance for everybody. That is a per-shop resource, and it is what
 * this client is shaped around.
 *
 * Everything here is server-side. The API key belongs in the server's
 * environment; a phone that carries it could read and write every shop's
 * messages.
 */

import { WhatsAppError } from './errors.js'

export const VIVENTURE_DEFAULT_URL = 'https://whatsapp.nextmavens.com' as const

export interface ViventureConfig {
  baseUrl?: string
  /** The account that owns the projects, e.g. `acct_…`. */
  accountId?: string
  /** The project that holds the instances, e.g. `proj_…`. */
  projectId?: string
  apiKey?: string
  /** Override fetch for testing. */
  fetch?: typeof fetch
}

export interface ViventureInstance {
  publicId: string
  name: string
  status: string
  phone?: string | null
  /** Present only while a pairing QR is current. */
  qrCode?: { image?: string; code?: string } | null
}

export interface ViventureInstanceState {
  /** The instance's public id, e.g. `inst_…`. */
  id: string
  status: string
  /** The WhatsApp number the session is paired with. */
  phoneNumber?: string | null
  capabilities?: string[]
  connectedAt?: string | null
}

export interface ViventureSendResult {
  messageId: string
  /** The platform accepted the message. It has NOT been delivered. */
  status: 'accepted'
}

export class ViventureClient {
  private readonly baseUrl: string
  private readonly accountId: string
  private readonly projectId: string
  private readonly apiKey: string
  private readonly fetch: typeof fetch

  constructor(config: ViventureConfig = {}) {
    this.baseUrl = (config.baseUrl ?? process.env.VIVENTURE_API_URL ?? VIVENTURE_DEFAULT_URL).replace(/\/+$/, '')
    this.accountId = config.accountId ?? process.env.VIVENTURE_ACCOUNT_ID ?? ''
    this.projectId = config.projectId ?? process.env.VIVENTURE_PROJECT_ID ?? ''
    this.apiKey = config.apiKey ?? process.env.VIVENTURE_API_KEY ?? ''
    this.fetch = config.fetch ?? globalThis.fetch.bind(globalThis)

    if (!this.apiKey) {
      throw new Error('VIVENTURE_API_KEY environment variable is required. See @soostori/whatsapp README.')
    }
  }

  /** The project-scoped path every instance route hangs off. */
  private projectPath(): string {
    if (!this.accountId || !this.projectId) {
      throw new WhatsAppError(
        'VIVENTURE_ACCOUNT_ID and VIVENTURE_PROJECT_ID are required.',
        'VIVENTURE_CONFIG_MISSING',
      )
    }
    return `/api/v1/accounts/${this.accountId}/projects/${this.projectId}`
  }

  private async request<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...(headers ?? {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new WhatsAppError(
        `Viventure API error: ${res.status}`,
        'VIVENTURE_ERROR',
        res.status,
        errBody,
      )
    }
    return res.json() as Promise<T>
  }

  /** Every instance in the project. */
  async listInstances(): Promise<ViventureInstance[]> {
    return this.request<ViventureInstance[]>('GET', `${this.projectPath()}/instances`)
  }

  /**
   * Creates the instance for one shop's WhatsApp number.
   *
   * Repeating a name inside the same project returns the instance that
   * already has it, so a shop that taps "connect" twice does not end up
   * with two numbers.
   */
  async createInstance(name: string): Promise<ViventureInstance> {
    return this.request<ViventureInstance>('POST', `${this.projectPath()}/instances`, { name })
  }

  /** One instance, including the pairing QR when one is current. */
  async getInstance(publicId: string): Promise<ViventureInstance> {
    return this.request<ViventureInstance>('GET', `${this.projectPath()}/instances/${publicId}`)
  }

  /** Starts the session. The QR arrives on the next read of the instance. */
  async connectInstance(publicId: string): Promise<{ success: boolean; status: string }> {
    return this.request('POST', `${this.projectPath()}/instances/${publicId}/connect`)
  }

  async disconnectInstance(publicId: string): Promise<{ status: string }> {
    return this.request('POST', `${this.projectPath()}/instances/${publicId}/disconnect`)
  }

  async deleteInstance(publicId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `${this.projectPath()}/instances/${publicId}`)
  }

  /** The live connection state — the thing the settings screen polls. */
  async getInstanceState(publicId: string): Promise<ViventureInstanceState> {
    return this.request<ViventureInstanceState>('GET', `${this.projectPath()}/instances/${publicId}/state`)
  }

  /** The WhatsApp number an instance is paired with, when it is connected. */
  async getPhoneNumber(publicId: string): Promise<string | null> {
    const state = await this.getInstanceState(publicId)
    return state.phoneNumber ?? null
  }

  /**
   * Queues a text message.
   *
   * The answer is 202: the platform ACCEPTED the message and will send it
   * later, one at a time, at a human-shaped pace. It has not been
   * delivered. Watch the webhooks if you need to know that.
   *
   * @param idempotencyKey the same key never sends the message twice.
   */
  async sendText(opts: {
    instancePublicId: string
    number: string
    text: string
    idempotencyKey?: string
  }): Promise<ViventureSendResult> {
    const result = await this.request<{ id?: string; messageId?: string }>(
      'POST',
      '/api/v1/messages/send',
      {
        instancePublicId: opts.instancePublicId,
        number: opts.number,
        text: opts.text,
        type: 'text',
      },
      opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
    )
    return { messageId: result.id ?? result.messageId ?? '', status: 'accepted' }
  }
}
