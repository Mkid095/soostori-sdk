import { describe, it, expect } from 'vitest'
import { createTumaClient } from '../src/client'

/**
 * The token the provider hands back.
 *
 * The live API answers its authentication request like this:
 *
 *   { success: true, message: 'Authentication successful', data: { token, expires_in } }
 *
 * — the token is INSIDE `data`. It used to be read from the top level, where
 * it never was, so the token was always undefined and every call afterwards
 * went out as `Bearer undefined`. The provider said "Authentication
 * successful" and then refused everything, so every payment failed while the
 * handshake looked perfectly healthy.
 */

function clientAnswering(body: unknown): { client: ReturnType<typeof createTumaClient>; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchMock = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch

  const client = createTumaClient({
    apiKey: 'test-key',
    businessEmail: 'shop@example.com',
    fetch: fetchMock,
  })
  return { client, calls }
}

describe('TumaClient — reading the token back', () => {
  it('reads the token from `data`, where the live API puts it', async () => {
    const { client } = clientAnswering({
      success: true,
      message: 'Authentication successful',
      data: { token: 'tok-from-data', expires_in: 3600 },
    })

    expect(await client.refreshToken()).toBe('tok-from-data')
  })

  it('still reads a token from the top level, for an older API shape', async () => {
    const { client } = clientAnswering({
      success: true,
      token: 'tok-from-top',
      expires_in: 3600,
    })

    expect(await client.refreshToken()).toBe('tok-from-top')
  })

  it('sends the token it was given on the next request', async () => {
    const { client, calls } = clientAnswering({
      success: true,
      message: 'Authentication successful',
      data: { token: 'tok-from-data', expires_in: 3600 },
    })

    await client.refreshToken()
    // The banks reference is fetched without a token on purpose, so the
    // authenticated call is the one that matters.
    await client.stkPush({
      amount: 100,
      phone: '254712345678',
      reference: 'test',
      callbackUrl: 'https://example.com/callback',
    }).catch(() => undefined)

    const authedCall = calls.find(c => c.url.includes('/payment/stk-push'))
    const headers = authedCall?.init?.headers as Record<string, string> | undefined
    expect(headers?.Authorization).toBe('Bearer tok-from-data')
  })
})
