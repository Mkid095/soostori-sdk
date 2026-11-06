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

export const VIVENTURE_DEFAULT_URL = 'https://whatsapp.fidscript.com' as const

/**
 * The base URL the client builds its paths on.
 *
 * Every path in this client already starts with `/api/v1`, so the base has
 * to be the bare host. The platform's own CLI config spells the base with
 * the version on the end — `https://whatsapp.fidscript.com/api/v1` — so a
 * base URL copied from there would otherwise produce
 * `/api/v1/api/v1/accounts/…`, which the platform answers with a 404 that
 * looks like a missing route rather than a mis-shaped URL.
 */
export function normaliseBaseUrl(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/api\/v1$/, '')
}

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

/** The kinds of payload the platform actually transmits. */
export type ViventureMediaType = 'text' | 'image' | 'video' | 'document' | 'audio'

export interface ViventureMediaSendResult extends ViventureSendResult {
  type: ViventureMediaType
}

/**
 * The platform's own reading of one of its messages.
 *
 * A send answers 202 (accepted) and the delivery travels later, at the
 * platform's own pace. This is the read that says where it is now:
 * `queued` / `processing` means still in motion, `sent` / `skipped` /
 * `failed` are where it ended. `attempts` and `lastError` are the shape of
 * the ending.
 */
export type ViventureMessageState = 'queued' | 'processing' | 'sent' | 'failed' | 'skipped'

export interface ViventureMessageStatus {
  /** The public message id, e.g. `msg_…`. */
  messageId: string
  /** `queued` | `processing` | `sent` | `failed` | `skipped`. */
  state: ViventureMessageState
  /** How many times the outbox has tried to send it. */
  attempts?: number
  /** What the last attempt said, when there was one. */
  lastError?: string | null
  /** The receipt the platform recorded, when it has one. */
  receipt?: string | null
}

export class ViventureClient {
  private readonly baseUrl: string
  private readonly accountId: string
  private readonly projectId: string
  private readonly apiKey: string
  private readonly fetch: typeof fetch

  constructor(config: ViventureConfig = {}) {
    this.baseUrl = normaliseBaseUrl(
      config.baseUrl ?? process.env.VIVENTURE_API_URL ?? VIVENTURE_DEFAULT_URL,
    )
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
   * Creates a webhook bound to one instance.
   *
   * The signing secret comes back ONCE, in this response, and cannot be read
   * again — so the caller has to store it. That is why it is returned
   * separately rather than hidden behind a getter.
   */
  async createWebhook(opts: {
    instancePublicId: string
    url: string
    events: string[]
  }): Promise<{ publicId: string; secret: string }> {
    const result = await this.request<{
      webhook?: { publicId?: string; secret?: string };
      publicId?: string;
      secret?: string;
    }>('POST', `${this.projectPath()}/webhooks`, {
      instanceId: opts.instancePublicId,
      url: opts.url,
      events: opts.events,
    });
    return {
      publicId: result.webhook?.publicId ?? result.publicId ?? '',
      secret: result.webhook?.secret ?? result.secret ?? '',
    };
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

  /**
   * Queues a media message (image, video, document or audio).
   *
   * The platform transmits media: `media` is an http(s) URL the platform
   * fetches at send time (preferred — the file is not carried through the
   * queue), or base64 inline (capped at 16 MB). `caption` is optional text
   * that travels with the file; `fileName` matters for a document.
   *
   * The answer is 202: accepted, not delivered. Watch the webhooks.
   */
  async sendMedia(opts: {
    instancePublicId: string
    number: string
    /** image | video | document | audio. */
    type: 'image' | 'video' | 'document' | 'audio'
    /** An http(s) URL, or base64 inline (<= 16 MB). */
    media: string
    caption?: string
    fileName?: string
    mimeType?: string
    idempotencyKey?: string
  }): Promise<ViventureMediaSendResult> {
    const result = await this.request<{ id?: string; messageId?: string }>(
      'POST',
      '/api/v1/messages/send',
      {
        instancePublicId: opts.instancePublicId,
        number: opts.number,
        type: opts.type,
        media: opts.media,
        ...(opts.caption !== undefined ? { caption: opts.caption } : {}),
        ...(opts.fileName !== undefined ? { fileName: opts.fileName } : {}),
        ...(opts.mimeType !== undefined ? { mimeType: opts.mimeType } : {}),
      },
      opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
    )
    return {
      messageId: result.id ?? result.messageId ?? '',
      status: 'accepted',
      type: opts.type,
    }
  }

  /**
   * The platform's own reading of one of its messages, by its public id.
   *
   * A send answers 202 and says nothing more. This is the question the
   * caller asks when it needs to know where the message is now: is it still
   * in the outbox, did it go out, or did it fail? The id comes back from
   * `sendText` / `sendMedia`, so the two are one pair.
   */
  async getMessageStatus(messageId: string): Promise<ViventureMessageStatus> {
    const result = await this.request<{
      id?: string;
      messageId?: string;
      state?: string;
      status?: string;
      attempts?: number;
      lastError?: string | null;
      receipt?: string | null;
    }>('GET', `/api/v1/messages/${encodeURIComponent(messageId)}`)
    // The list route speaks `state`; one read speaks `status`. Both are the
    // same word in the end, and a body that names neither reads as still
    // in motion rather than as a guess.
    const state = (result.state ?? result.status ?? 'queued') as ViventureMessageState
    return {
      messageId: result.id ?? result.messageId ?? messageId,
      state,
      ...(result.attempts !== undefined ? { attempts: result.attempts } : {}),
      ...(result.lastError !== undefined ? { lastError: result.lastError } : {}),
      ...(result.receipt !== undefined ? { receipt: result.receipt } : {}),
    }
  }
}
