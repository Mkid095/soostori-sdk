import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createEvolutionClient } from '../src/client'
import { WhatsAppChannel } from '../src/channel'

describe('EvolutionClient', () => {
  const prevEnv = { ...process.env }
  beforeEach(() => {
    process.env.EVOLUTION_API_URL = 'https://evo.test'
    process.env.EVOLUTION_INSTANCE = 'test-instance'
    process.env.EVOLUTION_API_KEY = 'test-key'
  })
  afterEach(() => {
    process.env = { ...prevEnv }
  })

  it('throws if EVOLUTION_API_KEY is missing', () => {
    delete process.env.EVOLUTION_API_KEY
    expect(() => createEvolutionClient({ fetch: vi.fn() })).toThrow(/EVOLUTION_API_KEY/)
  })

  it('sends text message', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ key: { id: 'm1' }, status: 'sent' }), { status: 200 }))
    const client = createEvolutionClient({ fetch: fetch as unknown as typeof fetch })
    const result = await client.sendText({ number: '254712345678', text: 'Hello' })
    expect(result.messageId).toBe('m1')
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toContain('https://evo.test/message/sendText/test-instance')
  })

  it('gets instance status', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ state: 'open' }), { status: 200 }))
    const client = createEvolutionClient({ fetch: fetch as unknown as typeof fetch })
    const status = await client.getStatus()
    expect(status.state).toBe('open')
  })

  it('throws WhatsAppError on failure', async () => {
    const fetch = vi.fn(async () => new Response('{"error":"x"}', { status: 401 }))
    const client = createEvolutionClient({ fetch: fetch as unknown as typeof fetch })
    await expect(client.sendText({ number: 'x', text: 'y' })).rejects.toThrow(/Evolution API error/)
  })
})

describe('WhatsAppChannel', () => {
  it('enabled when instance is open', async () => {
    const evolution = {
      getStatus: vi.fn(async () => ({ state: 'open' as const })),
      sendText: vi.fn(async () => ({ messageId: 'm1', status: 'sent' as const })),
    } as any
    const resolvePhone = vi.fn(async () => '+254712345678')
    const ch = new WhatsAppChannel(evolution, resolvePhone)
    expect(await ch.isEnabled('s', 'u')).toBe(true)
  })

  it('disabled when instance is not open', async () => {
    const evolution = {
      getStatus: vi.fn(async () => ({ state: 'close' as const })),
      sendText: vi.fn(),
    } as any
    const ch = new WhatsAppChannel(evolution, async () => null)
    expect(await ch.isEnabled('s', 'u')).toBe(false)
  })

  it('disabled when status check throws', async () => {
    const evolution = {
      getStatus: vi.fn(async () => { throw new Error('offline') }),
      sendText: vi.fn(),
    } as any
    const ch = new WhatsAppChannel(evolution, async () => null)
    expect(await ch.isEnabled('s', 'u')).toBe(false)
  })

  it('skips send when phone not resolved', async () => {
    const evolution = {
      getStatus: vi.fn(async () => ({ state: 'open' as const })),
      sendText: vi.fn(),
    } as any
    const ch = new WhatsAppChannel(evolution, async () => null)
    await ch.send({
      id: 'n1' as any, shopId: 's' as any, triggerEvent: 'sale.confirmed',
      recipientId: 'u' as any, title: 'T', body: 'B', priority: 'normal',
      createdAt: new Date().toISOString(),
    })
    expect(evolution.sendText).not.toHaveBeenCalled()
  })
})
