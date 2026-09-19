/**
 * FileUploadQueue — durable queue of pending uploads with local persistence.
 *
 * Desktop and Mobile MUST be able to capture files while offline. The
 * queue stores PendingUpload metadata + the local file reference; the
 * binary is never serialized into the queue (it stays at its local path
 * / URI / web File until upload time).
 *
 * The queue is backed by a pluggable `FileQueueStorage` interface; the
 * default implementation is in-memory but the production adapter
 * (Desktop, Mobile) persists to SQLite.
 *
 * On application restart, `loadPending()` rehydrates the queue and any
 * committed entries from a prior run, so the UI can recover state.
 */

import type {
  FileId,
  FileReference,
  FileStateEvent,
  LocalFileSource,
  PendingUpload,
  StorageKind,
  StorageVisibility,
  UploadState,
} from '@soostori/contracts'
import { asFileId } from '@soostori/contracts'
import { newId } from '@soostori/core'

export interface QueuedFileRow {
  /** Local id, assigned at queue time. Becomes the FileId on commit. */
  readonly localId: string
  readonly kind: StorageKind
  readonly visibility: StorageVisibility
  readonly contentType: string
  readonly sizeBytes: number
  /** Reference to the local binary (never serialized). */
  readonly local: LocalFileSource
  readonly hintName?: string
  readonly capturedAt: string
  /** Lifecycle state. */
  state: UploadState
  attempt: number
  /** Next attempt time (ISO8601). */
  nextAttemptAt: string
  lastError?: string
  /** Set when state transitions to committed. */
  remote?: FileReference
}

export interface FileQueueStorage {
  upsert(row: QueuedFileRow): Promise<void>
  delete(localId: string): Promise<void>
  list(): Promise<QueuedFileRow[]>
  get(localId: string): Promise<QueuedFileRow | null>
}

export type FileStateListener = (event: FileStateEvent) => void

export class FileUploadQueue {
  private readonly storage: FileQueueStorage
  private readonly listeners = new Set<FileStateListener>()

  constructor(storage: FileQueueStorage) {
    this.storage = storage
  }

  /** Enqueue a new pending upload. */
  async enqueue(input: Omit<PendingUpload, 'localId' | 'capturedAt'>): Promise<QueuedFileRow> {
    const row: QueuedFileRow = {
      localId: `local-${newId()}`,
      kind: input.kind,
      visibility: input.visibility,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      local: input.local,
      hintName: input.hintName,
      capturedAt: new Date().toISOString(),
      state: 'queued',
      attempt: 0,
      nextAttemptAt: new Date().toISOString(),
    }
    await this.storage.upsert(row)
    return row
  }

  async list(): Promise<QueuedFileRow[]> {
    return this.storage.list()
  }

  async get(localId: string): Promise<QueuedFileRow | null> {
    return this.storage.get(localId)
  }

  /** Items whose nextAttemptAt has elapsed and that are in a retryable state. */
  async dueForRetry(now: Date = new Date()): Promise<QueuedFileRow[]> {
    const all = await this.storage.list()
    return all.filter(r =>
      (r.state === 'queued' || r.state === 'retrying' || r.state === 'failed') &&
      new Date(r.nextAttemptAt).getTime() <= now.getTime()
    )
  }

  /** Transition a row to a new state and notify listeners. */
  async transition(
    localId: string,
    nextState: UploadState,
    patch: Partial<QueuedFileRow> = {}
  ): Promise<QueuedFileRow | null> {
    const existing = await this.storage.get(localId)
    if (!existing) return null
    const previousState = existing.state
    const updated: QueuedFileRow = {
      ...existing,
      ...patch,
      state: nextState,
    }
    await this.storage.upsert(updated)
    const event: FileStateEvent = {
      fileId: asFileId(updated.localId),
      previousState,
      nextState,
      occurredAt: new Date().toISOString(),
      errorMessage: updated.lastError,
      attempt: updated.attempt,
    }
    for (const l of this.listeners) {
      try { l(event) } catch { /* listener errors must not break the queue */ }
    }
    return updated
  }

  async commit(localId: string, remote: FileReference): Promise<QueuedFileRow | null> {
    return this.transition(localId, 'committed', { remote })
  }

  async remove(localId: string): Promise<void> {
    await this.storage.delete(localId)
  }

  /** Subscribe to state transitions. Returns an unsubscribe function. */
  onStateChange(listener: FileStateListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

/** In-memory queue storage — for tests and ephemeral use only. */
export class InMemoryFileQueueStorage implements FileQueueStorage {
  private readonly rows = new Map<string, QueuedFileRow>()

  async upsert(row: QueuedFileRow): Promise<void> {
    this.rows.set(row.localId, { ...row })
  }
  async delete(localId: string): Promise<void> {
    this.rows.delete(localId)
  }
  async list(): Promise<QueuedFileRow[]> {
    return Array.from(this.rows.values())
  }
  async get(localId: string): Promise<QueuedFileRow | null> {
    return this.rows.get(localId) ?? null
  }
}
