/**
 * Storage contract — provider-neutral file references and lifecycle types.
 *
 * These types are the only thing applications see. They are intentionally
 * free of provider concepts (no Cloudinary/R2/S3 URLs, public_ids, buckets,
 * keys, regions). The provider is an implementation detail behind the
 * FIDScript storage service at apiinstant.fidscript.com.
 *
 * Business records MUST reference files by `FileId` (or `FileReference`),
 * never by a raw URL. Download URLs are resolved on demand by
 * `StorageService.downloadUrl(fileId)` so authorization can be enforced
 * server-side and URLs can expire.
 *
 * Files and binary uploads are NOT carried in `SyncEvent.payload`. Sync
 * events are JSON-shaped and may only reference files by `FileId`.
 */

/** Stable opaque file identifier issued by the FIDScript storage service. */
export type FileId = string & { readonly __brand: 'FileId' }

export const asFileId = (s: string): FileId => s as FileId

/** Construct a FileReference from raw fields. Runtime helper for adapters. */
export function asFileReference(input: {
  id: string
  kind: StorageKind
  visibility: StorageVisibility
  name?: string
  contentType: string
  sizeBytes: number
  path: string
  uploadedAt: string
  sha256?: string
}): FileReference {
  return {
    id: asFileId(input.id),
    kind: input.kind,
    visibility: input.visibility,
    name: input.name,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    path: input.path,
    uploadedAt: input.uploadedAt,
    sha256: input.sha256,
  }
}

/** Provider-neutral storage category. Drives path generation and perms. */
export type StorageKind =
  | 'influencer.profile_image'
  | 'salesperson.profile_image'
  | 'salesperson.document'
  | 'shop.logo'
  | 'shop.image'
  | 'product.image'
  | 'training.video'
  | 'training.thumbnail'
  | 'blog.media'
  | 'business.file'
  | 'receipt'

/** Whether the underlying object is publicly viewable or auth-gated. */
export type StorageVisibility = 'public' | 'private'

/**
 * Provider-neutral file reference. Business records store `FileReference`
 * (or just `FileId`) — never raw URLs.
 */
export interface FileReference {
  readonly id: FileId
  readonly kind: StorageKind
  readonly visibility: StorageVisibility
  /** Original filename, optional (UX only; not used for storage path). */
  readonly name?: string
  readonly contentType: string
  readonly sizeBytes: number
  /** Provider-neutral path (set by SDK; apps cannot inject). */
  readonly path: string
  /** When the upload was committed remotely (ISO8601). */
  readonly uploadedAt: string
  /** Optional sha256 for integrity verification. */
  readonly sha256?: string
}

/**
 * Upload lifecycle state machine.
 *
 *   new ─▶ queued ─▶ uploading ─▶ committed
 *             │           │
 *             ▼           ▼
 *           failed ─▶ retrying ─▶ uploading (loop)
 *             │
 *             ▼
 *         dead_letter
 *
 * Plus terminal:
 *   canceled
 */
export type UploadState =
  | 'queued'
  | 'uploading'
  | 'committed'
  | 'failed'
  | 'retrying'
  | 'dead_letter'
  | 'canceled'

/**
 * Event emitted by `StorageService.onStateChange` when a file's state
 * transitions. Persisted to local storage so apps can recover the UI on
 * restart.
 */
export interface FileStateEvent {
  readonly fileId: FileId
  readonly previousState: UploadState
  readonly nextState: UploadState
  readonly occurredAt: string
  readonly errorMessage?: string
  readonly attempt?: number
}

/** Local file location for a pending upload (provider-neutral). */
export type LocalFileSource =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  | { readonly kind: 'web_file'; readonly file: File }
  | { readonly kind: 'path'; readonly path: string; readonly size: number; readonly contentType: string }
  | { readonly kind: 'uri'; readonly uri: string; readonly size: number; readonly contentType: string }

/** Parameters for a pending upload captured locally. */
export interface PendingUpload {
  /** Local unique id, used as the queue key until the remote FileId is known. */
  readonly localId: string
  readonly kind: StorageKind
  readonly visibility: StorageVisibility
  readonly contentType: string
  readonly sizeBytes: number
  readonly local: LocalFileSource
  /** Optional client-side hint; SDK may strip. */
  readonly hintName?: string
  /** When the local file was captured. */
  readonly capturedAt: string
}

/**
 * Outcome classification of an upload attempt — used by the retry policy
 * to decide whether to backoff or move to dead_letter.
 */
export type UploadAttemptOutcome =
  | { readonly kind: 'success' }
  | { readonly kind: 'retry'; readonly reason: 'network' | 'timeout' | 'server_5xx' | 'rate_limit' | 'request_timeout' }
  | { readonly kind: 'fatal'; readonly reason: 'client_4xx' | 'invalid_input' | 'unauthorized' | 'not_found' | 'too_large' }
