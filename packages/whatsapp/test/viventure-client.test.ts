import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ViventureClient } from '../src/viventure-client'
import { ViventureChannel } from '../src/viventure-channel'

const CONFIG = {
  baseUrl: 'https://wa.test',
  accountId: 'acct_1',
  projectId: 'proj_2',
  apiKey: 'key_3',
}

describe('ViventureClient', () => {
  const prevEnv = { ...process.env }
  beforeEach(() => {
    process.env.VIVENTURE_API_URL = ''
    process.env.VIVENTURE_ACCOUNT_ID = ''
    process.env.VIVENTURE_PROJECT_ID = ''
    process.env.VIVENTURE_API_KEY = ''
  })
  afterEach(() => {
    process.env = { ...prevEnv }
  })

  it('throws if the API key is missing', () => {
    expect(() => new ViventureClient({ ...CONFIG, apiKey: '' })).toThrow(/VIVENTURE_API_KEY/)
  })

  it('lists the instances of the project', async () => {
    const fetch = vi.fn(async () => new Response('[]', { status: 200 }))
    const client = new ViventureClient({ ...CONFIG, fetch: fetch as unknown as typeof fetch })

    await client.listInstances()

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://wa.test/api/v1/accounts/acct_1/projects/proj_2/instances')
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('key_3')
  })

  it('creates an instance by name', async () => {
    const fetch = vi.fn(async () => new Response('{"publicId":"inst_1","name":"Shop","status":"CREATED"}', { status: 201 }))
    const client = new ViventureClient({ ...CONFIG, fetch: fetch as unknown as typeof fetch })

    const instance = await client.createInstance('Shop')

    expect(instance.publicId).toBe('inst_1')
    const [, init] = fetch.mock.calls[0]
    expect(init.body).toBe('{"name":"Shop"}')
  })

  it('reads the pairing QR off an instance', async () => {
    const fetch = vi.fn(async () => new Response('{"publicId":"inst_1","qrCode":{"image":"base64","code":"123"}}', { status: 200 }))
    const client = new ViventureClient({ ...CONFIG, fetch: fetch as unknown as typeof fetch })

    const instance = await client.getInstance('inst_1')

    expect(instance.qrCode?.image).toBe('base64')
  })

  it('sends a text message with the idempotency header', async () => {
    const fetch = vi.fn(async () => new Response('{"id":"msg_1"}', { status: 202 }))
    const client = new ViventureClient({ ...CONFIG, fetch: fetch as unknown as typeof fetch })

    const result = await client.sendText({
      instancePublicId: 'inst_1',
      number: '+254700000000',
      text: 'Your balance is 500.',
      idempotencyKey: 'notification-9',
    })

    expect(result.messageId).toBe('msg_1')
    // 202 means ACCEPTED, not delivered.
    expect(result.status).toBe('accepted')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://wa.test/api/v1/messages/send')
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('notification-9')
    expect(JSON.parse(init.body as string).instancePublicId).toBe('inst_1')
  })

  it('raises a WhatsAppError when the platform refuses', async () => {
    const fetch = vi.fn(async () => new Response('{"error":"nope"}', { status: 403 }))
    const client = new ViventureClient({ ...CONFIG, fetch: fetch as unknown as typeof fetch })

    await expect(client.listInstances()).rejects.toThrow(/Viventure API error: 403/)
  })
})

describe('ViventureChannel', () => {
  const notification = {
    id: 'notif-1',
    shopId: 'shop-1',
    triggerEvent: 'debt.overdue',
    recipientId: 'customer-1',
    title: 'Payment reminder',
    body: 'You owe KSh 500.',
    priority: 'high' as const,
    createdAt: '2026-01-01T00:00:00Z',
  }

  it('is enabled only when the shop has a connected instance', async () => {
    const client = {
      getInstanceState: vi.fn(async () => ({ instanceId: 'inst_1', status: 'CONNECTED' })),
      sendText: vi.fn(async () => ({ messageId: 'msg_1', status: 'accepted' as const })),
    }
    const channel = new ViventureChannel(client as never, {
      resolveInstance: async () => 'inst_1',
      resolvePhone: async () => '+254700000000',
    })

    expect(await channel.isEnabled('shop-1', 'customer-1')).toBe(true)
  })

  it('is disabled when the shop has not connected a number', async () => {
    const client = { getInstanceState: vi.fn(), sendText: vi.fn() }
    const channel = new ViventureChannel(client as never, {
      resolveInstance: async () => null,
      resolvePhone: async () => '+254700000000',
    })

    expect(await channel.isEnabled('shop-1', 'customer-1')).toBe(false)
  })

  it('sends the notification text with the notification id as the idempotency key', async () => {
    const sendText = vi.fn(async () => ({ messageId: 'msg_1', status: 'accepted' as const }))
    const client = { getInstanceState: vi.fn(), sendText }
    const channel = new ViventureChannel(client as never, {
      resolveInstance: async () => 'inst_1',
      resolvePhone: async () => '+254700000000',
    })

    await channel.send(notification)

    expect(sendText).toHaveBeenCalledWith({
      instancePublicId: 'inst_1',
      number: '+254700000000',
      text: '*Payment reminder*\n\nYou owe KSh 500.',
      idempotencyKey: 'notif-1',
    })
  })

  it('sends nothing when the recipient has no number', async () => {
    const sendText = vi.fn()
    const client = { getInstanceState: vi.fn(), sendText }
    const channel = new ViventureChannel(client as never, {
      resolveInstance: async () => 'inst_1',
      resolvePhone: async () => null,
    })

    await channel.send(notification)

    expect(sendText).not.toHaveBeenCalled()
  })
})
