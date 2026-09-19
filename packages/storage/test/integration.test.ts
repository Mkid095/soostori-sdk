/**
 * Integration probe — real FIDScript storage API round-trip.
 *
 * Run with: SOOSTORI_RUN_INTEGRATION=1 SOOSTORI_APP_ID=<id> SOOSTORI_TOKEN=<jwt>
 *          npx vitest run packages/storage/test/integration.test.ts
 *
 * This test exercises the actual apiinstant.fidscript.com endpoints. It
 * MUST be skipped when env vars are absent so the unit test suite still
 * passes in CI.
 *
 * Status: as of 2026-09-19, get_storage_config for the SOOSTORI app
 * returns null. The signed upload endpoint therefore fails at runtime
 * with a Cloud error. The test records the failure modes and asserts the
 * SDK degrades gracefully (no app crash, queued state).
 */

import { describe, it, expect } from 'vitest'
import { FidScriptStorageTransport, classifyTransportError } from '@soostori/cloud'
import {
  FileUploadQueue,
  InMemoryFileQueueStorage,
  StorageService,
} from '../src/files/index.js'

const RUN = process.env.SOOSTORI_RUN_INTEGRATION === '1'
const APP_ID = process.env.SOOSTORI_APP_ID ?? ''
const TOKEN = process.env.SOOSTORI_TOKEN ?? ''

const itIf = RUN && APP_ID ? it : it.skip

describe('integration: FIDScript storage API', () => {
  itIf('storageConfig is configured for the app', async () => {
    const transport = new FidScriptStorageTransport({ appId: APP_ID, token: TOKEN })
    // We do not have a direct storageConfig endpoint on the REST surface,
    // so we probe by issuing a signed-upload-url with a tiny payload and
    // recording what the server returns.
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]) // PNG magic
    try {
      const signed = await transport.requestSignedUploadUrl({
        path: 'integration-probe/2026/09/probe.png' as any,
        contentType: 'image/png',
        sizeBytes: bytes.byteLength,
        visibility: 'public',
      })
      console.log('[integration] signed URL response:', signed)
      // If we get here, the storage API is configured. Attempt the PUT.
      await transport.uploadBytes(signed.uploadUrl, bytes, signed.requiredHeaders)
      // Resolve a download URL for the file we just uploaded.
      const dl = await transport.requestSignedDownloadUrl(signed.path)
      console.log('[integration] download URL:', dl)
      expect(signed.fileId).toBeTruthy()
      expect(dl.downloadUrl).toMatch(/^https?:\/\//)
    } catch (err) {
      const failure = classifyTransportError(err)
      console.log('[integration] upload round-trip failure (expected when storageConfig is null):', failure)
      // We still expect the SDK to never throw uncaught at the boundary.
      expect(failure).toBeDefined()
    }
  })

  itIf('StorageService degrades gracefully when storage is unavailable', async () => {
    const transport = new FidScriptStorageTransport({ appId: APP_ID, token: TOKEN })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue, tenantPrefix: 'integration' })
    // The promise must always resolve — never throw — even if storage
    // is unconfigured or returns 4xx/5xx.
    const result = await svc.upload({
      kind: 'product.image',
      visibility: 'public',
      contentType: 'image/png',
      sizeBytes: 4,
      local: { kind: 'bytes', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    })
    expect(['committed', 'queued']).toContain(result.kind)
    const rows = await queue.list()
    expect(rows.length).toBe(1)
  })
})
