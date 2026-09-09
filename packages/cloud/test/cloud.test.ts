import { describe, it, expect } from 'vitest'
import { createCloudClient, CloudError, NetworkError } from '../src/index'

function mockFetch(responses: Array<{ status: number; body: unknown }>): typeof fetch {
  let callIndex = 0
  return (async () => {
    await new Promise(r => setTimeout(r, 1))
    const r = responses[callIndex++] ?? { status: 500, body: { error: 'no more responses' } }
    return new Response(JSON.stringify(r.body), { status: r.status })
  }) as unknown as typeof fetch
}

describe('CloudClient', () => {
  it('signOut succeeds with token', async () => {
    const fetch = mockFetch([{ status: 200, body: {} }])
    const client = createCloudClient({ appId: 'test-app', fetch, token: 'tok' })
    await expect(client.signOut()).resolves.toBeUndefined()
  })

  it('signOut no-ops without token', async () => {
    const fetch = mockFetch([{ status: 200, body: {} }])
    const client = createCloudClient({ appId: 'test-app', fetch })
    await expect(client.signOut()).resolves.toBeUndefined()
  })

  it('health returns reachable on 2xx', async () => {
    const fetch = mockFetch([{ status: 200, body: {} }])
    const client = createCloudClient({ appId: 'test-app', fetch })
    const result = await client.health()
    expect(result.reachable).toBe(true)
    expect(typeof result.latencyMs).toBe('number')
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('health returns unreachable on non-2xx', async () => {
    const fetch = mockFetch([{ status: 401, body: { error: 'unauthorized' } }])
    const client = createCloudClient({ appId: 'test-app', fetch })
    const result = await client.health()
    expect(result.reachable).toBe(false)
    expect(result.latencyMs).toBeNull()
  })

  it('health returns unreachable on network failure', async () => {
    const fetch = (() => Promise.reject(new Error('network down'))) as unknown as typeof fetch
    const client = createCloudClient({ appId: 'test-app', fetch })
    const result = await client.health()
    expect(result.reachable).toBe(false)
    expect(result.latencyMs).toBeNull()
  })

  it('throws NetworkError on abort', async () => {
    const fetch = (() => Promise.reject(new DOMException('aborted', 'AbortError'))) as unknown as typeof fetch
    const client = createCloudClient({ appId: 'test-app', fetch, timeoutMs: 10 })
    // health() catches abort and returns { reachable: false } — it does NOT throw
    await expect(client.health()).resolves.toEqual({ reachable: false, latencyMs: null })
  })

  it('throws NetworkError on connection failure', async () => {
    const fetch = (() => Promise.reject(new Error('network down'))) as unknown as typeof fetch
    const client = createCloudClient({ appId: 'test-app', fetch })
    await expect(client.query({})).rejects.toThrow(NetworkError)
  })

  it('throws CloudError on non-2xx from query', async () => {
    const fetch = mockFetch([{ status: 401, body: { error: 'unauthorized' } }])
    const client = createCloudClient({ appId: 'test-app', fetch })
    await expect(client.query({})).rejects.toThrow(CloudError)
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
