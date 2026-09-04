/**
 * Evolution API client — self-hosted WhatsApp.
 *
 * Reads API base URL and instance name from environment variables.
 * NEVER hardcode secrets in source.
 */

import { WhatsAppError } from './errors'

export const EVOLUTION_DEFAULT_URL = 'http://localhost:8080' as const

export interface EvolutionConfig {
  baseUrl?: string
  instanceName?: string
  apiKey?: string
  /** Override fetch for testing. */
  fetch?: typeof fetch
}

export interface SendTextOptions {
  /** E.164 phone number. */
  number: string
  text: string
}

export interface SendResult {
  messageId: string
  status: 'sent' | 'pending' | 'failed'
}

interface EvolutionResponse {
  key?: { id: string }
  status?: string
}

export class EvolutionClient {
  private readonly baseUrl: string
  private readonly instance: string
  private readonly apiKey: string
  private readonly fetch: typeof fetch

  constructor(config: EvolutionConfig = {}) {
    this.baseUrl = config.baseUrl ?? process.env.EVOLUTION_API_URL ?? EVOLUTION_DEFAULT_URL
    this.instance = config.instanceName ?? process.env.EVOLUTION_INSTANCE ?? 'soostori'
    this.apiKey = config.apiKey ?? process.env.EVOLUTION_API_KEY ?? ''
    this.fetch = config.fetch ?? globalThis.fetch.bind(globalThis)

    if (!this.apiKey) {
      throw new Error('EVOLUTION_API_KEY environment variable is required. See @soostori/whatsapp README.')
    }
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'apikey': this.apiKey,
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetch(this.url(path), {
      method, headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new WhatsAppError(`Evolution API error: ${res.status}`, 'EVOLUTION_ERROR', res.status, errBody)
    }
    return res.json() as Promise<T>
  }

  /** Send a text message. */
  async sendText(opts: SendTextOptions): Promise<SendResult> {
    const result = await this.request<EvolutionResponse>(
      'POST',
      `/message/sendText/${this.instance}`,
      { number: opts.number, text: opts.text }
    )
    return { messageId: result.key?.id ?? '', status: (result.status as SendResult['status']) ?? 'sent' }
  }

  /** Send a template message. */
  async sendTemplate(opts: { number: string; templateName: string; variables: Record<string, string> }): Promise<SendResult> {
    const result = await this.request<EvolutionResponse>(
      'POST',
      `/message/sendTemplate/${this.instance}`,
      { number: opts.number, templateName: opts.templateName, variables: opts.variables }
    )
    return { messageId: result.key?.id ?? '', status: (result.status as SendResult['status']) ?? 'sent' }
  }

  /** Check instance connection state. */
  async getStatus(): Promise<{ state: 'open' | 'close' | 'connecting' }> {
    return this.request('GET', `/instance/connectionState/${this.instance}`)
  }
}

/** Factory — reads config from env vars. */
export function createEvolutionClient(config?: EvolutionConfig): EvolutionClient {
  return new EvolutionClient(config)
}
