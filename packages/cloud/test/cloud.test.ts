import { describe, it, expect, vi } from 'vitest'
import { createCloudClient, CloudError, NetworkError } from '../src/index'

function mockFetch(responses: Array<{ status: number; body: unknown }>): typeof fetch {
  let callIndex = 0
  return (async () => {
    const r = responses[callIndex++] ?? { status: 500, body: { error: 'no more responses' } }
    return new Response(JSON.stringify(r.body), { status: r.status })
  }) as unknown as typeof fetch
}

describe('CloudClient', () => {
  it('sends magic code', async () => {
    const fetch = mockFetch([{ status: 200, body: { ok: true } }])
    const client = createCloudClient({ appId: 'test-app', fetch })
    const result = await client.sendMagicCode('a@b.com')
    expect(result.ok).toBe(true)
  })

  it('verifyMagicCode returns user', async () => {
    const fetch = mockFetch([{ status: 200, body: { user: { id: 'u1', email: 'a@b.com' } } }])
    const client = createCloudClient({ appId: 'test-app', fetch })
    const result = await client.verifyMagicCode('a@b.com', '123456')
    expect(result.user.id).toBe('u1')
  })

  it('throws CloudError on non-2xx', async () => {
    const fetch = mockFetch([{ status: 401, body: { error: 'unauthorized' } }])
    const client = createCloudClient({ appId: 'test-app', fetch })
    await expect(client.sendMagicCode('a@b.com')).rejects.toThrow(CloudError)
  })

  it('throws NetworkError on abort', async () => {
    const fetch = (() => Promise.reject(new DOMException('aborted', 'AbortError'))) as unknown as typeof fetch
    const client = createCloudClient({ appId: 'test-app', fetch, timeoutMs: 10 })
    await expect(client.sendMagicCode('a@b.com')).rejects.toThrow()
  })

  it('throws NetworkError on connection failure', async () => {
    const fetch = (() => Promise.reject(new Error('network down'))) as unknown as typeof fetch
    const client = createCloudClient({ appId: 'test-app', fetch })
    await expect(client.sendMagicCode('a@b.com')).rejects.toThrow(NetworkError)
  })

  it('upsert validates entity payload', async () => {
    const fetch = mockFetch([{ status: 200, body: {} }])
    const client = createCloudClient({ appId: 'test-app', fetch })
    await expect(
      client.upsert('shops', 'test-id', { name: 'Shop' })  // missing required fields
    ).rejects.toThrow()
  })

  it('getById returns first record', async () => {
    const fetch = mockFetch([{ status: 200, body: { shops: [{ id: 's1', name: 'S' }] } }])
    const client = createCloudClient({ appId: 'test-app', fetch })
    const shop = await client.getById<{ id: string; name: string }>('shops', 's1')
    expect(shop?.name).toBe('S')
  })

  it('getById returns null when empty', async () => {
    const fetch = mockFetch([{ status: 200, body: { shops: [] } }])
    const client = createCloudClient({ appId: 'test-app', fetch })
    const shop = await client.getById('shops', 'missing')
    expect(shop).toBeNull()
  })
})
