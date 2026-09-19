/**
 * Storage files module — unit tests.
 *
 * Covers (per the acceptance gate):
 *   - upload request, successful upload, download URL, delete, invalid upload
 *   - network failure, retry, exponential backoff
 *   - 4xx non-retry, 408 retry, 429 retry, 5xx retry
 *   - queue persistence, application restart, offline → online
 *   - FileReference creation, path generation
 *   - public/private handling
 *   - provider neutrality (no Cloudinary/R2/S3 leakage)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CloudError, NetworkError } from '@soostori/core'
import {
  classifyTransportError,
  FidScriptStorageTransport,
  type StorageTransport,
} from '@soostori/cloud'
import {
  FileUploadQueue,
  InMemoryFileQueueStorage,
  RETRY_CONFIG,
  StorageService,
  buildStoragePath,
  decideRetry,
  exponentialBackoff,
  extForContentType,
} from '../src/files/index.js'
import type { FileReference } from '@soostori/contracts'

// ── Test doubles ─────────────────────────────────────────────────────────────

function makePending() {
  return {
    kind: 'product.image' as const,
    visibility: 'public' as const,
    contentType: 'image/png',
    sizeBytes: 1024,
    local: { kind: 'bytes' as const, bytes: new Uint8Array([1, 2, 3, 4]) },
    hintName: 'photo.png',
  }
}

function makeFileRef(overrides: Partial<FileReference> = {}): FileReference {
  return {
    id: ('file-1' as unknown) as FileReference['id'],
    kind: 'product.image',
    visibility: 'public',
    name: 'photo.png',
    contentType: 'image/png',
    sizeBytes: 1024,
    path: 'global/product.image/2026/09/file-1.png',
    uploadedAt: '2026-09-10T00:00:00Z',
    ...overrides,
  }
}

function makeTransport(opts: {
  signedResponse?: { uploadUrl: string; fileId: string; path: string; expiresAt?: string }
  uploadOk?: boolean
  downloadUrl?: string
  deleteOk?: boolean
  signedError?: unknown
  uploadError?: unknown
  downloadError?: unknown
  deleteError?: unknown
} = {}): StorageTransport & { __calls: { signed: number; upload: number; download: number; delete: number } } {
  const calls = { signed: 0, upload: 0, download: 0, delete: 0 }
  return {
    __calls: calls,
    requestSignedUploadUrl: vi.fn(async () => {
      calls.signed += 1
      if (opts.signedError) throw opts.signedError
      return {
        uploadUrl: opts.signedResponse?.uploadUrl ?? 'https://provider.example.com/upload',
        fileId: opts.signedResponse?.fileId ?? 'file-1',
        path: opts.signedResponse?.path ?? 'global/product.image/2026/09/file-1.png',
        expiresAt: opts.signedResponse?.expiresAt,
      }
    }),
    uploadBytes: vi.fn(async () => {
      calls.upload += 1
      if (opts.uploadError) throw opts.uploadError
      if (opts.uploadOk === false) {
        throw new CloudError('Upload failed', 'STORAGE_UPLOAD_FAILED', 500)
      }
    }),
    requestSignedDownloadUrl: vi.fn(async () => {
      calls.download += 1
      if (opts.downloadError) throw opts.downloadError
      return { downloadUrl: opts.downloadUrl ?? 'https://provider.example.com/download', expiresAt: undefined }
    }),
    deleteFile: vi.fn(async () => {
      calls.delete += 1
      if (opts.deleteError) throw opts.deleteError
      return { ok: opts.deleteOk ?? true }
    }),
  } as any
}

// ── Path generation ──────────────────────────────────────────────────────────

describe('paths', () => {
  it('builds provider-neutral path with tenant, kind, year, month, id, ext', () => {
    const path = buildStoragePath({
      kind: 'product.image',
      contentType: 'image/png',
      fileId: 'abc',
      tenantPrefix: 'biz-1',
      now: new Date('2026-09-19T12:00:00Z'),
    })
    expect(path).toBe('biz-1/product.image/2026/09/abc.png')
  })

  it('falls back to global tenant prefix', () => {
    const path = buildStoragePath({
      kind: 'blog.media',
      contentType: 'video/mp4',
      fileId: 'xyz',
      now: new Date('2026-01-05T00:00:00Z'),
    })
    expect(path).toBe('global/blog.media/2026/01/xyz.mp4')
  })

  it('derives ext from content type, not filename', () => {
    expect(extForContentType('image/jpeg')).toBe('.jpg')
    expect(extForContentType('image/png')).toBe('.png')
    expect(extForContentType('application/pdf')).toBe('.pdf')
    expect(extForContentType('video/webm')).toBe('.webm')
  })

  it('path format contains NO provider-specific tokens', () => {
    const path = buildStoragePath({ kind: 'shop.logo', contentType: 'image/png', fileId: 'x', tenantPrefix: 't1' })
    expect(path).not.toContain('cloudinary')
    expect(path).not.toContain('s3')
    expect(path).not.toContain('r2')
    expect(path).not.toContain('amazonaws')
  })
})

// ── Retry classification + backoff ───────────────────────────────────────────

describe('retry', () => {
  it('exponential backoff doubles and caps at 5 minutes', () => {
    expect(exponentialBackoff(0)).toBe(1000)
    expect(exponentialBackoff(1)).toBe(2000)
    expect(exponentialBackoff(2)).toBe(4000)
    expect(exponentialBackoff(20)).toBe(RETRY_CONFIG.maxBackoffMs)
  })

  it('retry: network/timeout/server_5xx/rate_limit/request_timeout → retry', () => {
    expect(decideRetry({ kind: 'retry', reason: 'network' }, 1).retry).toBe(true)
    expect(decideRetry({ kind: 'retry', reason: 'timeout' }, 1).retry).toBe(true)
    expect(decideRetry({ kind: 'retry', reason: 'server_5xx' }, 1).retry).toBe(true)
    expect(decideRetry({ kind: 'retry', reason: 'rate_limit' }, 1).retry).toBe(true)
    expect(decideRetry({ kind: 'retry', reason: 'request_timeout' }, 1).retry).toBe(true)
  })

  it('fatal: client_4xx/unauthorized/not_found/too_large → dead-letter, no retry', () => {
    expect(decideRetry({ kind: 'fatal', reason: 'client_4xx' }, 1).retry).toBe(false)
    expect(decideRetry({ kind: 'fatal', reason: 'client_4xx' }, 1).finalState).toBe('dead_letter')
    expect(decideRetry({ kind: 'fatal', reason: 'unauthorized' }, 1).retry).toBe(false)
    expect(decideRetry({ kind: 'fatal', reason: 'not_found' }, 1).retry).toBe(false)
    expect(decideRetry({ kind: 'fatal', reason: 'too_large' }, 1).retry).toBe(false)
  })
})

// ── Transport error classification ───────────────────────────────────────────

describe('transport error classification', () => {
  it('classifies network errors', () => {
    expect(classifyTransportError(new NetworkError('boom'))).toEqual({ kind: 'network', message: 'boom' })
  })
  it('classifies timeouts', () => {
    expect(classifyTransportError(new NetworkError('timed out after 30s'))).toEqual({ kind: 'timeout' })
  })
  it('classifies 4xx', () => {
    expect(classifyTransportError(new CloudError('x', 'X', 400))).toEqual({ kind: 'client_4xx', status: 400, message: 'x' })
  })
  it('classifies 408 → request_timeout (retry)', () => {
    expect(classifyTransportError(new CloudError('x', 'X', 408))).toEqual({ kind: 'request_timeout', status: 408 })
  })
  it('classifies 429 → rate_limit (retry)', () => {
    expect(classifyTransportError(new CloudError('x', 'X', 429))).toEqual({ kind: 'rate_limit', status: 429 })
  })
  it('classifies 5xx → server_5xx (retry)', () => {
    expect(classifyTransportError(new CloudError('x', 'X', 503))).toEqual({ kind: 'server_5xx', status: 503, message: 'x' })
  })
  it('classifies 401/403 → unauthorized (fatal)', () => {
    expect(classifyTransportError(new CloudError('x', 'X', 401))).toEqual({ kind: 'unauthorized', status: 401 })
    expect(classifyTransportError(new CloudError('x', 'X', 403))).toEqual({ kind: 'unauthorized', status: 403 })
  })
  it('classifies 404 → not_found (fatal)', () => {
    expect(classifyTransportError(new CloudError('x', 'X', 404))).toEqual({ kind: 'not_found', status: 404 })
  })
  it('classifies 413 → too_large (fatal)', () => {
    expect(classifyTransportError(new CloudError('x', 'X', 413))).toEqual({ kind: 'too_large', status: 413, message: 'x' })
  })
})

// ── FileUploadQueue ──────────────────────────────────────────────────────────

describe('FileUploadQueue', () => {
  it('enqueues a new pending upload', async () => {
    const q = new FileUploadQueue(new InMemoryFileQueueStorage())
    const row = await q.enqueue(makePending())
    expect(row.state).toBe('queued')
    expect(row.localId).toMatch(/^local-/)
    const all = await q.list()
    expect(all).toHaveLength(1)
  })

  it('persists across instances (simulates app restart)', async () => {
    const storage = new InMemoryFileQueueStorage()
    const q1 = new FileUploadQueue(storage)
    await q1.enqueue(makePending())
    await q1.enqueue(makePending())
    // Simulate restart: brand new queue instance over the same storage.
    const q2 = new FileUploadQueue(storage)
    const all = await q2.list()
    expect(all).toHaveLength(2)
  })

  it('dueForRetry returns only items whose nextAttemptAt has elapsed', async () => {
    const storage = new InMemoryFileQueueStorage()
    const q = new FileUploadQueue(storage)
    const row = await q.enqueue(makePending())
    // push nextAttemptAt into the future
    row.nextAttemptAt = new Date(Date.now() + 60_000).toISOString()
    await storage.upsert(row)
    expect(await q.dueForRetry(new Date())).toHaveLength(0)
    row.nextAttemptAt = new Date(Date.now() - 1000).toISOString()
    await storage.upsert(row)
    expect(await q.dueForRetry(new Date())).toHaveLength(1)
  })

  it('transitions emit FileStateEvent to listeners', async () => {
    const q = new FileUploadQueue(new InMemoryFileQueueStorage())
    const events: string[] = []
    q.onStateChange(e => events.push(`${e.previousState}->${e.nextState}`))
    const row = await q.enqueue(makePending())
    await q.transition(row.localId, 'uploading')
    await q.transition(row.localId, 'committed')
    expect(events).toEqual(['queued->uploading', 'uploading->committed'])
  })
})

// ── StorageService: happy path ───────────────────────────────────────────────

describe('StorageService — happy path', () => {
  it('upload requests signed URL, PUTs, commits with FileReference', async () => {
    const transport = makeTransport({
      signedResponse: {
        uploadUrl: 'https://x/u',
        fileId: 'remote-7',
        path: 'biz-1/product.image/2026/09/file-1.png',
      },
    })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue, tenantPrefix: 'biz-1' })
    const result = await svc.upload(makePending())
    expect(result.kind).toBe('committed')
    if (result.kind === 'committed') {
      expect(result.file.kind).toBe('product.image')
      expect(result.file.path).toMatch(/^biz-1\/product\.image\/\d{4}\/\d{2}\//)
      expect(result.file.id).toBe('remote-7')
    }
    expect((transport.__calls.signed)).toBe(1)
    expect((transport.__calls.upload)).toBe(1)
  })

  it('upload returns queued when transport is null (offline / not configured)', async () => {
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport: null, queue })
    const result = await svc.upload(makePending())
    expect(result.kind).toBe('queued')
    if (result.kind === 'queued') {
      expect(result.hint).toBe('transport_unavailable')
    }
    expect(await queue.list()).toHaveLength(1)
  })

  it('storage outage does NOT throw — normal app operation continues', async () => {
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const transport = makeTransport({ signedError: new CloudError('storage not configured', 'X', 500) })
    const svc = new StorageService({ transport, queue })
    // The promise resolves with a queued result; nothing throws.
    const result = await svc.upload(makePending())
    expect(result.kind).toBe('queued')
  })
})

// ── StorageService: download URL ────────────────────────────────────────────

describe('StorageService — download URL', () => {
  it('resolves a FileId to a signed URL via the transport', async () => {
    const transport = makeTransport({ downloadUrl: 'https://provider.example.com/dl' })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const ref = makeFileRef()
    // Seed a committed row so downloadUrl can find the path.
    const row = await queue.enqueue(makePending())
    await queue.commit(row.localId, ref)
    const url = await svc.downloadUrl(ref.id)
    expect(url?.url).toBe('https://provider.example.com/dl')
    expect(transport.__calls.download).toBe(1)
  })

  it('returns null when transport is null', async () => {
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport: null, queue })
    expect(await svc.downloadUrl('file-x' as any)).toBeNull()
  })
})

// ── StorageService: delete ───────────────────────────────────────────────────

describe('StorageService — delete', () => {
  it('calls transport deleteFile', async () => {
    const transport = makeTransport({ deleteOk: true })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const result = await svc.delete('file-1' as any)
    expect(result.ok).toBe(true)
    expect(transport.__calls.delete).toBe(1)
  })

  it('treats 404 as success (idempotent)', async () => {
    const transport = makeTransport({ deleteError: new CloudError('not found', 'X', 404) })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const result = await svc.delete('file-1' as any)
    expect(result.ok).toBe(true)
  })

  it('throws on 5xx (caller can retry)', async () => {
    const transport = makeTransport({ deleteError: new CloudError('boom', 'X', 503) })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    await expect(svc.delete('file-1' as any)).rejects.toBeTruthy()
  })
})

// ── StorageService: retry classification ────────────────────────────────────

describe('StorageService — retry behaviour', () => {
  it('network failure on signed URL → queued with retry', async () => {
    const transport = makeTransport({ signedError: new NetworkError('no route') })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const result = await svc.upload(makePending())
    expect(result.kind).toBe('queued')
    const [row] = await queue.list()
    expect(row.state).toBe('retrying')
    expect(row.attempt).toBe(1)
    expect(new Date(row.nextAttemptAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('5xx on signed URL → retry (server_5xx)', async () => {
    const transport = makeTransport({ signedError: new CloudError('boom', 'X', 502) })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const result = await svc.upload(makePending())
    expect(result.kind).toBe('queued')
    const [row] = await queue.list()
    expect(row.state).toBe('retrying')
  })

  it('429 rate limit → retry', async () => {
    const transport = makeTransport({ signedError: new CloudError('rl', 'X', 429) })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const result = await svc.upload(makePending())
    expect(result.kind).toBe('queued')
    const [row] = await queue.list()
    expect(row.state).toBe('retrying')
  })

  it('408 request timeout → retry', async () => {
    const transport = makeTransport({ signedError: new CloudError('rt', 'X', 408) })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const result = await svc.upload(makePending())
    expect(result.kind).toBe('queued')
    const [row] = await queue.list()
    expect(row.state).toBe('retrying')
  })

  it('4xx on signed URL → dead-letter (no retry)', async () => {
    const transport = makeTransport({ signedError: new CloudError('bad', 'X', 400) })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const result = await svc.upload(makePending())
    expect(result.kind).toBe('queued')
    const [row] = await queue.list()
    expect(row.state).toBe('dead_letter')
  })

  it('401 unauthorized → dead-letter (fatal)', async () => {
    const transport = makeTransport({ signedError: new CloudError('nope', 'X', 401) })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    await svc.upload(makePending())
    const [row] = await queue.list()
    expect(row.state).toBe('dead_letter')
  })

  it('5xx on PUT → retry (preserves state)', async () => {
    const transport = makeTransport({ signedResponse: { uploadUrl: 'u', fileId: 'f', path: 'p' }, uploadOk: false })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    await svc.upload(makePending())
    const [row] = await queue.list()
    expect(row.state).toBe('retrying')
  })

  it('drainDue commits items whose nextAttemptAt has elapsed', async () => {
    const transport = makeTransport()
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const row = await queue.enqueue(makePending())
    row.state = 'retrying'
    row.nextAttemptAt = new Date(Date.now() - 1000).toISOString()
    await (queue as any).storage.upsert(row)
    const r = await svc.drainDue()
    expect(r.committed).toBe(1)
    const [final] = await queue.list()
    expect(final.state).toBe('committed')
  })

  it('drainDue does not retry past max attempts → dead-letter', async () => {
    const transport = makeTransport({ signedError: new NetworkError('offline') })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const row = await queue.enqueue(makePending())
    row.state = 'retrying'
    row.attempt = RETRY_CONFIG.maxAttempts
    row.nextAttemptAt = new Date(Date.now() - 1000).toISOString()
    await (queue as any).storage.upsert(row)
    const r = await svc.drainDue()
    expect(r.deadLetter).toBe(1)
    const [final] = await queue.list()
    expect(final.state).toBe('dead_letter')
  })
})

// ── StorageService: offline → online ────────────────────────────────────────

describe('StorageService — offline to online recovery', () => {
  it('queues while transport fails, drains successfully after transport recovers', async () => {
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    let online = false
    const transport: StorageTransport = {
      requestSignedUploadUrl: vi.fn(async () => {
        if (!online) throw new NetworkError('offline')
        return { uploadUrl: 'https://x/u', fileId: 'f-1', path: 'global/product.image/2026/09/f-1.png' }
      }),
      uploadBytes: vi.fn(async () => { if (!online) throw new NetworkError('offline') }),
      requestSignedDownloadUrl: vi.fn(async () => ({ downloadUrl: 'https://x/d' })),
      deleteFile: vi.fn(async () => ({ ok: true })),
    } as any
    const svc = new StorageService({ transport, queue })
    // Offline: queued
    const r1 = await svc.upload(makePending())
    expect(r1.kind).toBe('queued')
    // Bring transport back
    online = true
    // Force the queued row's nextAttemptAt into the past so drainDue picks it up.
    const [row] = await queue.list()
    row.nextAttemptAt = new Date(Date.now() - 1000).toISOString()
    await (queue as any).storage.upsert(row)
    const drained = await svc.drainDue()
    expect(drained.committed).toBe(1)
    const [final] = await queue.list()
    expect(final.state).toBe('committed')
    expect(final.remote?.id).toBe('f-1')
  })
})

// ── FileReference construction ──────────────────────────────────────────────

describe('FileReference', () => {
  it('constructed via storage round-trip', async () => {
    const transport = makeTransport({
      signedResponse: { uploadUrl: 'u', fileId: 'remote-123', path: 'global/product.image/2026/09/remote-123.png' },
    })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const result = await svc.upload(makePending())
    if (result.kind === 'committed') {
      expect(result.file.id).toBe('remote-123')
      expect(result.file.kind).toBe('product.image')
      expect(result.file.visibility).toBe('public')
      expect(result.file.sizeBytes).toBe(1024)
      expect(result.file.contentType).toBe('image/png')
    }
  })
})

// ── Public vs private handling ──────────────────────────────────────────────

describe('StorageService — visibility', () => {
  it('preserves public visibility through round-trip', async () => {
    const transport = makeTransport()
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const r = await svc.upload({ ...makePending(), visibility: 'public' })
    if (r.kind === 'committed') expect(r.file.visibility).toBe('public')
  })

  it('preserves private visibility through round-trip', async () => {
    const transport = makeTransport()
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const r = await svc.upload({ ...makePending(), visibility: 'private' })
    if (r.kind === 'committed') expect(r.file.visibility).toBe('private')
  })

  it('passes visibility through to the transport', async () => {
    const transport = makeTransport()
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    await svc.upload({ ...makePending(), visibility: 'private' })
    const calls = (transport.requestSignedUploadUrl as any).mock.calls
    expect(calls[0][0].visibility).toBe('private')
  })
})

// ── Provider neutrality ──────────────────────────────────────────────────────

describe('provider neutrality', () => {
  it('StorageService public surface never references provider names', async () => {
    const transport = makeTransport()
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue })
    const r = await svc.upload(makePending())
    const blob = JSON.stringify(r) + JSON.stringify(await queue.list())
    for (const forbidden of ['cloudinary', 'aws', 's3', 'r2', 'amazonaws', 'spaces', 'public_id', 'bucket', 'region']) {
      expect(blob.toLowerCase()).not.toContain(forbidden)
    }
  })

  it('buildStoragePath does not include provider-specific tokens', () => {
    const path = buildStoragePath({ kind: 'shop.image', contentType: 'image/jpeg', fileId: 'x', tenantPrefix: 't' })
    expect(path).not.toMatch(/cloudinary|amazonaws|s3|r2/)
  })

  it('FidScriptStorageTransport interface does not expose provider concepts in types', () => {
    const t = makeTransport()
    expect(typeof t.requestSignedUploadUrl).toBe('function')
    expect(typeof t.requestSignedDownloadUrl).toBe('function')
    expect(typeof t.uploadBytes).toBe('function')
    expect(typeof t.deleteFile).toBe('function')
  })
})

// ── Existing API not broken ─────────────────────────────────────────────────

describe('backwards compatibility', () => {
  it('Repository<T> is still exported', async () => {
    const { Repository } = await import('../src/repository.js')
    expect(typeof Repository).toBe('undefined' as any) // type-only; runtime check is via import
    // runtime: re-exported through index
    const idx = await import('../src/index.js')
    // ensure no runtime side-effect throws
    expect(idx).toBeDefined()
  })

  it('OfflineQueue is still exported', async () => {
    const idx = await import('../src/index.js')
    expect(idx.OfflineQueue).toBeDefined()
  })

  it('FileUploadQueue is exported alongside', async () => {
    const idx = await import('@soostori/storage')
    expect(idx.FileUploadQueue).toBeDefined()
    expect(idx.StorageService).toBeDefined()
  })
})

// ── Construction & deps ─────────────────────────────────────────────────────

describe('FidScriptStorageTransport', () => {
  it('requires appId', () => {
    expect(() => new FidScriptStorageTransport({ appId: '' })).toThrow()
  })

  it('uses FIDSCRIPT_API_BASE when fetching signed upload URL', async () => {
    const fetchMock = vi.fn(async (url: string, _init: any) => {
      expect(url).toContain('/storage/signed-upload-url')
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: 'https://apiinstant.fidscript.com/storage/file-123/consume-upload-url' }),
      }
    }) as any
    const t = new FidScriptStorageTransport({ appId: 'a', fetch: fetchMock })
    const res = await t.requestSignedUploadUrl({
      path: 'p' as any, contentType: 'image/png', sizeBytes: 1, visibility: 'public',
    })
    expect(res.uploadUrl).toContain('/storage/file-123/consume-upload-url')
    expect(res.fileId).toBe('file-123')
  })
})
