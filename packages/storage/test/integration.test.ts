/**
 * Integration probe — real FIDScript storage API round-trip.
 *
 * Run with:
 *   $env:SOOSTORI_RUN_INTEGRATION="1"
 *   $env:SOOSTORI_APP_ID="487be5c5-7615-4bbd-b3b7-3aa97154ca99"
 *   $env:SOOSTORI_TOKEN="<admin-token>"
 *   npx vitest run packages/storage/test/integration.test.ts
 *
 * This test exercises the actual apiinstant.fidscript.com endpoints. It
 * MUST be skipped when env vars are absent so the unit test suite still
 * passes in CI.
 *
 * Confirmed API shapes (2026-09-19):
 *   POST /storage/signed-upload-url
 *     body: { app_id, path, contentType, sizeBytes, visibility }
 *     → { data: "https://host/storage/{fileId}/consume-upload-url" }
 *   PUT /storage/{fileId}/consume-upload-url
 *     headers: Content-Type, Content-Length
 *     → 200 OK
 *   GET /storage/signed-download-url?app_id=...&path=...
 *     → { data: "https://res.cloudinary.com/..." }
 */

import { describe, it, expect } from 'vitest'
import { FidScriptStorageTransport } from '@soostori/cloud'
import {
  FileUploadQueue,
  InMemoryFileQueueStorage,
  StorageService,
} from '../src/files/index.js'

const RUN = process.env.SOOSTORI_RUN_INTEGRATION === '1'
const APP_ID = process.env.SOOSTORI_APP_ID ?? ''
const TOKEN = process.env.SOOSTORI_TOKEN ?? ''

const itIf = RUN && APP_ID && TOKEN ? it : it.skip

describe('integration: FIDScript storage API', () => {
  itIf('full upload → download round-trip succeeds with real FileId', async () => {
    const transport = new FidScriptStorageTransport({ appId: APP_ID, token: TOKEN })
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]) // PNG magic
    const path = `integration-probe/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/probe.png`

    // Step 1: Get signed upload URL
    const signed = await transport.requestSignedUploadUrl({
      path: path as any,
      contentType: 'image/png',
      sizeBytes: bytes.byteLength,
      visibility: 'public',
    })
    expect(signed.uploadUrl).toMatch(/^https:\/\/apiinstant\.fidscript\.com\/storage\/.+\/consume-upload-url$/)
    expect(signed.fileId).toMatch(/^[0-9a-f-]{36}$/) // UUID

    // Step 2: Upload bytes to the signed URL
    await transport.uploadBytes(signed.uploadUrl, bytes, { 'Content-Type': 'image/png' })

    // Step 3: Get signed download URL — should be a Cloudinary CDN URL
    const dl = await transport.requestSignedDownloadUrl(signed.path)
    expect(dl.downloadUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//)
    // Note: we don't fetch the URL here — the environment may not have outbound
    // access to Cloudinary. The URL shape confirms the CDN path is correct.
  })

  itIf('StorageService returns committed result after successful upload', async () => {
    const transport = new FidScriptStorageTransport({ appId: APP_ID, token: TOKEN })
    const queue = new FileUploadQueue(new InMemoryFileQueueStorage())
    const svc = new StorageService({ transport, queue, tenantPrefix: 'integration-test' })
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

    const result = await svc.upload({
      kind: 'product.image',
      visibility: 'public',
      contentType: 'image/png',
      sizeBytes: bytes.byteLength,
      local: { kind: 'bytes', bytes },
    })

    expect(result.kind).toBe('committed')
    expect(result.file.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.file.path).toMatch(/^integration-test\/product\.image\/\d{4}\/\d{2}\//)
    expect(result.file.visibility).toBe('public')
    expect(result.file.contentType).toBe('image/png')
    expect(result.file.sizeBytes).toBe(bytes.byteLength)
  })
})
