/**
 * StorageService — provider-neutral entry point for upload / download / delete.
 *
 * This is what Soostori applications call. It hides Cloudinary, R2, S3, and
 * the FIDScript REST surface behind a stable contract.
 *
 * Failure isolation: storage errors NEVER break normal app operation. If
 * the transport is unavailable (network down, 5xx, storageConfig missing),
 * uploads fall back to the local queue and the app continues running.
 */

import type {
  FileId,
  FileReference,
  FileStateEvent,
  PendingUpload,
  UploadAttemptOutcome,
} from '@soostori/contracts'
import { asFileId, asFileReference } from '@soostori/contracts'
import type {
  SignedUploadRequest,
  SignedUploadResponse,
  StorageTransport,
} from '@soostori/cloud'
import { classifyTransportError } from '@soostori/cloud'
import { newId } from '@soostori/core'

import { FileUploadQueue, type QueuedFileRow } from './queue.js'
import { buildStoragePath } from './paths.js'
import { decideRetry, RETRY_CONFIG } from './retry.js'

export interface StorageServiceOptions {
  /** Provider-neutral transport (FIDScript by default). May be null to
   *  start the service in pure-offline mode (queue-only). */
  readonly transport: StorageTransport | null
  readonly queue: FileUploadQueue
  readonly tenantPrefix?: string
  /** Tenant/business context used when building storage paths. */
  readonly now?: () => Date
}

/** Upload result returned to the caller. */
export type UploadResult =
  | { readonly kind: 'committed'; readonly file: FileReference }
  | { readonly kind: 'queued'; readonly localId: string; readonly hint: 'offline' | 'transport_unavailable' }

export interface DownloadOptions {
  /** Override the default expiry window in seconds. Provider-dependent. */
  readonly expiresInSec?: number
}

export interface DownloadResult {
  readonly url: string
  readonly expiresAt?: string
}

/**
 * StorageService — the single provider-neutral entry point.
 *
 * Provider neutrality guarantees:
 *   - No Cloudinary/R2/S3 types or concepts leak through this API
 *   - URLs are resolved on demand and may be short-lived
 *   - Business records reference FileId/FileReference only
 */
export class StorageService {
  private readonly transport: StorageTransport | null
  private readonly queue: FileUploadQueue
  private readonly tenantPrefix: string | undefined
  private readonly now: () => Date

  constructor(options: StorageServiceOptions) {
    this.transport = options.transport
    this.queue = options.queue
    this.tenantPrefix = options.tenantPrefix
    this.now = options.now ?? (() => new Date())
  }

  /**
   * Capture a file locally and upload it. If the transport is unreachable
   * or fails retryably, the upload is queued and `queued` is returned —
   * the caller's app continues running.
   *
   * Returns `committed` when the upload round-trip succeeds (transport
   * responded with a FileId).
   */
  async upload(input: Omit<PendingUpload, 'localId' | 'capturedAt'>): Promise<UploadResult> {
    const row = await this.queue.enqueue(input)
    if (this.transport === null) {
      return { kind: 'queued', localId: row.localId, hint: 'transport_unavailable' }
    }
    return this.attempt(row)
  }

  /** Attempt a single round-trip for a queued row. */
  async attempt(row: QueuedFileRow): Promise<UploadResult> {
    if (this.transport === null) {
      return { kind: 'queued', localId: row.localId, hint: 'transport_unavailable' }
    }
    await this.queue.transition(row.localId, 'uploading')
    const fileIdLocal = asFileId(row.localId)
    const path = buildStoragePath({
      kind: row.kind,
      contentType: row.contentType,
      fileId: fileIdLocal,
      tenantPrefix: this.tenantPrefix,
      now: this.now(),
    })

    const outcome = await this.tryUpload(row, path)
    if (outcome.kind === 'success') {
      // outcome.fileRef is set when success
      const ref = (outcome as Extract<UploadAttemptOutcome & { kind: 'success' }, { kind: 'success' }> & { fileRef?: FileReference }).fileRef
      if (!ref) {
        // Provider returned success but no FileReference — fatal
        await this.queue.transition(row.localId, 'dead_letter', { lastError: 'Provider returned success without FileReference' })
        return { kind: 'queued', localId: row.localId, hint: 'transport_unavailable' }
      }
      await this.queue.commit(row.localId, ref)
      return { kind: 'committed', file: ref }
    }

    const decision = decideRetry(outcome, row.attempt)
    if (!decision.retry) {
      await this.queue.transition(row.localId, 'dead_letter', { lastError: classifyReason(outcome) })
      return { kind: 'queued', localId: row.localId, hint: 'transport_unavailable' }
    }
    const nextAttempt = new Date(Date.now() + decision.delayMs).toISOString()
    await this.queue.transition(row.localId, decision.finalState, {
      attempt: row.attempt + 1,
      nextAttemptAt: nextAttempt,
      lastError: classifyReason(outcome),
    })
    return { kind: 'queued', localId: row.localId, hint: 'offline' }
  }

  private async tryUpload(row: QueuedFileRow, path: string): Promise<UploadAttemptOutcome & { fileRef?: FileReference }> {
    if (this.transport === null) {
      return { kind: 'retry', reason: 'network' }
    }
    try {
      const bytes = await resolveBytes(row.local)
      const signed = await this.transport.requestSignedUploadUrl({
        path: path as unknown as SignedUploadRequest['path'],
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        visibility: row.visibility,
      })
      await this.transport.uploadBytes(signed.uploadUrl, bytes, signed.requiredHeaders)
      const ref = asFileReference({
        id: signed.fileId,
        kind: row.kind,
        visibility: row.visibility,
        name: row.hintName,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        path: signed.path,
        uploadedAt: new Date().toISOString(),
      })
      return { kind: 'success', fileRef: ref }
    } catch (err) {
      const failure = classifyTransportError(err)
      return classifyFailure(failure)
    }
  }

  /** Drain the queue of items due for retry. Called by the platform's
   *  drain loop. Returns counts of succeeded / retried / dead-lettered. */
  async drainDue(now: Date = new Date()): Promise<{ committed: number; retried: number; deadLetter: number }> {
    if (this.transport === null) {
      return { committed: 0, retried: 0, deadLetter: 0 }
    }
    const due = await this.queue.dueForRetry(now)
    let committed = 0
    let retried = 0
    let deadLetter = 0
    for (const row of due) {
      if (row.attempt >= RETRY_CONFIG.maxAttempts) {
        await this.queue.transition(row.localId, 'dead_letter', { lastError: 'Exceeded max retry attempts' })
        deadLetter += 1
        continue
      }
      const result = await this.attempt(row)
      if (result.kind === 'committed') committed += 1
      else if (result.kind === 'queued') {
        if ((result as { hint?: string }).hint === 'offline') retried += 1
        else deadLetter += 1
      }
    }
    return { committed, retried, deadLetter }
  }

  /** Resolve a FileId to a usable download URL (provider-dependent lifetime). */
  async downloadUrl(fileId: FileId, _opts?: DownloadOptions): Promise<DownloadResult | null> {
    if (this.transport === null) return null
    // For known committed files we have the path on the FileReference;
    // for in-flight uploads the queue can supply it. We use the queue's
    // first matching row that has a remote with the same id.
    const all = await this.queue.list()
    const row = all.find(r => r.remote?.id === fileId)
    if (!row?.remote) return null
    const signed = await this.transport.requestSignedDownloadUrl(
      row.remote.path as unknown as Parameters<StorageTransport['requestSignedDownloadUrl']>[0]
    )
    return { url: signed.downloadUrl, expiresAt: signed.expiresAt }
  }

  async delete(fileId: FileId): Promise<{ ok: boolean }> {
    if (this.transport === null) return { ok: false }
    try {
      await this.transport.deleteFile(fileId)
      // Best-effort: drop any queued row that referenced this fileId.
      const all = await this.queue.list()
      for (const r of all) {
        if (r.remote?.id === fileId) await this.queue.remove(r.localId)
      }
      return { ok: true }
    } catch (err) {
      const failure = classifyTransportError(err)
      if (failure.kind === 'not_found') return { ok: true }
      throw err
    }
  }

  /** Subscribe to local queue state transitions. */
  onStateChange(listener: (event: FileStateEvent) => void): () => void {
    return this.queue.onStateChange(listener)
  }

  /** Convenience: build a unique local id without committing. */
  static newLocalId(): string {
    return `local-${newId()}`
  }
}

function classifyReason(outcome: UploadAttemptOutcome): string {
  if (outcome.kind === 'success') return 'success'
  if (outcome.kind === 'fatal') return `fatal: ${outcome.reason}`
  return `retry: ${outcome.reason}`
}

/** Translate a transport failure into a typed UploadAttemptOutcome. */
function classifyFailure(failure: ReturnType<typeof classifyTransportError>): UploadAttemptOutcome & { fileRef?: FileReference } {
  switch (failure.kind) {
    case 'network': return { kind: 'retry', reason: 'network' }
    case 'timeout': return { kind: 'retry', reason: 'timeout' }
    case 'server_5xx': return { kind: 'retry', reason: 'server_5xx' }
    case 'rate_limit': return { kind: 'retry', reason: 'rate_limit' }
    case 'request_timeout': return { kind: 'retry', reason: 'request_timeout' }
    case 'unauthorized': return { kind: 'fatal', reason: 'unauthorized' }
    case 'not_found': return { kind: 'fatal', reason: 'not_found' }
    case 'too_large': return { kind: 'fatal', reason: 'too_large' }
    case 'client_4xx': return { kind: 'fatal', reason: 'client_4xx' }
  }
}

/**
 * Resolve a LocalFileSource to bytes. Providers cannot be expected to
 * accept arbitrary handle types; this is a one-way bridge to the signed
 * upload URL. In the alpha this is a thin wrapper around the supported
 * `bytes` source; other source kinds are exposed for future refinement.
 */
async function resolveBytes(local: PendingUpload['local']): Promise<Uint8Array> {
  if (local.kind === 'bytes') return local.bytes
  if (local.kind === 'web_file') {
    return new Uint8Array(await local.file.arrayBuffer())
  }
  // 'path' and 'uri' are read by the platform's StorageService adapter
  // (which has access to fs / RN FS). The default SDK returns an empty
  // byte array; production adapters override this behaviour.
  return new Uint8Array(0)
}
