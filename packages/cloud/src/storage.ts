/**
 * FIDScript storage transport — provider-neutral signed URL helpers.
 *
 * The shape of these endpoints is based on the Web app's observed usage:
 *
 *   POST /storage/signed-upload-url
 *     body: { path, contentType, sizeBytes, visibility }
 *     ->   { uploadUrl, fileId, path, expiresAt? }
 *
 *   GET /storage/signed-download-url?path=...
 *     ->   { downloadUrl, expiresAt? }
 *
 *   POST /storage/delete
 *     body: { fileId } OR { path }
 *     ->   { ok: true }
 *
 * These shapes are NOT yet verified against a live instance — storage is
 * not configured for the SOOSTORI app (get_storage_config returns null).
 * The transport is intentionally narrow so any deviation from the live
 * API only requires changing the request/response types here, not the
 * downstream @soostori/storage consumers.
 *
 * Consumers (@soostori/storage) MUST NOT import this file directly; they
 * must import the `StorageTransport` interface only. This keeps the SDK
 * testable without a live backend.
 */

import type { FileId, StorageVisibility } from '@soostori/contracts'
import { asFileId } from '@soostori/contracts'
import { FIDSCRIPT_API_BASE, CloudError, NetworkError } from '@soostori/core'

/** Path the provider uses to address an object. Provider-neutral in shape. */
export type StoragePath = string & { readonly __brand: 'StoragePath' }

export const asStoragePath = (s: string): StoragePath => s as StoragePath

/** Request to obtain a signed upload URL. */
export interface SignedUploadRequest {
  readonly path: StoragePath
  readonly contentType: string
  readonly sizeBytes: number
  readonly visibility: StorageVisibility
}

/** Response from POST /storage/signed-upload-url. */
export interface SignedUploadResponse {
  readonly uploadUrl: string
  readonly fileId: FileId
  readonly path: StoragePath
  readonly expiresAt?: string
  /** Provider-required headers to include on the upload PUT. */
  readonly requiredHeaders?: Record<string, string>
}

export interface SignedDownloadResponse {
  readonly downloadUrl: string
  readonly expiresAt?: string
}

export interface DeleteResponse {
  readonly ok: true
}

/** Options for delete-by-path. One of `fileId` or `path` is required. */
export interface DeleteFileOptions {
  readonly fileId?: FileId
  readonly path?: StoragePath
}

/** Transport interface implemented by the FIDScript-backed client. */
export interface StorageTransport {
  requestSignedUploadUrl(request: SignedUploadRequest): Promise<SignedUploadResponse>

  /** Perform the actual PUT to the signed URL. Provider-agnostic: signed URL
   *  points at whatever blob store the platform has configured. */
  uploadBytes(uploadUrl: string, body: Uint8Array, headers?: Record<string, string>): Promise<void>

  requestSignedDownloadUrl(path: StoragePath): Promise<SignedDownloadResponse>

  /** Provider may not support delete via REST; if not supported, throws. */
  deleteFile(fileId: FileId): Promise<DeleteResponse>

  /** Delete by path — used when the fileId is unknown but the storage path is known.
   *  The FIDScript endpoint accepts either fileId OR path (Cloudinary public_id). */
  deleteByPath(path: StoragePath): Promise<DeleteResponse>
}

/** Options for the FIDScript-backed transport. */
export interface StorageTransportOptions {
  readonly appId: string
  readonly token?: string
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
}

/** Network/HTTP error classification used by the retry policy. */
export type TransportFailure =
  | { readonly kind: 'network'; readonly message: string }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'server_5xx'; readonly status: number; readonly message: string }
  | { readonly kind: 'rate_limit'; readonly status: number }
  | { readonly kind: 'request_timeout'; readonly status: number }
  | { readonly kind: 'client_4xx'; readonly status: number; readonly message: string }
  | { readonly kind: 'unauthorized'; readonly status: number }
  | { readonly kind: 'not_found'; readonly status: number }
  | { readonly kind: 'too_large'; readonly status: number; readonly message: string }

/**
 * FIDScript-backed implementation of `StorageTransport`.
 *
 * Per the audit, the exact response shapes on apiinstant.fidscript.com are
 * NOT verified. The current shape is the Web app's observed usage, with
 * extension points (requiredHeaders, expiresAt) that align with common
 * signed-URL patterns.
 */
export class FidScriptStorageTransport implements StorageTransport {
  private readonly appId: string
  private _token: string | undefined
  private readonly fetch: typeof fetch
  private readonly timeoutMs: number

  constructor(options: StorageTransportOptions) {
    if (!options.appId) throw new Error('appId is required for FidScriptStorageTransport')
    this.appId = options.appId
    this._token = options.token
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  setToken(token: string | undefined): void {
    this._token = token
  }

  private url(path: string): string {
    return `${FIDSCRIPT_API_BASE}${path}`
  }

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this._token) h.Authorization = `Bearer ${this._token}`
    return h
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetch(this.url(path), {
        method,
        headers: this.authHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new CloudError(
          `Storage request failed: ${res.status} ${res.statusText}`,
          'STORAGE_REQUEST_FAILED',
          res.status,
          errBody
        )
      }
      return res.json() as Promise<T>
    } catch (err) {
      if (err instanceof CloudError) throw err
      if ((err as Error).name === 'AbortError') {
        throw new NetworkError(`Storage request timed out after ${this.timeoutMs}ms`)
      }
      throw new NetworkError(`Storage network error: ${(err as Error).message}`)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async requestSignedUploadUrl(req: SignedUploadRequest): Promise<SignedUploadResponse> {
    // Response: { data: "https://host/storage/{fileId}/consume-upload-url" }
    const res = await this.request<{ data: string }>('POST', '/storage/signed-upload-url', {
      app_id: this.appId,
      path: req.path,
      contentType: req.contentType,
      sizeBytes: req.sizeBytes,
      visibility: req.visibility,
    })
    const uploadUrl: string = res.data
    const fileIdMatch = uploadUrl.match(/\/storage\/([^/]+)\/consume-upload-url$/)
    if (!fileIdMatch) throw new Error(`Cannot parse fileId from uploadUrl: ${uploadUrl}`)
    return {
      uploadUrl,
      fileId: asFileId(fileIdMatch[1]),
      path: asStoragePath(req.path),
    }
  }

  async uploadBytes(uploadUrl: string, body: Uint8Array, headers?: Record<string, string>): Promise<void> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetch(uploadUrl, {
        method: 'PUT',
        headers: headers ?? {},
        body: body as unknown as BodyInit,
        signal: controller.signal,
      })
      if (!res.ok) {
        throw new CloudError(
          `Upload PUT failed: ${res.status} ${res.statusText}`,
          'STORAGE_UPLOAD_FAILED',
          res.status
        )
      }
    } catch (err) {
      if (err instanceof CloudError) throw err
      if ((err as Error).name === 'AbortError') {
        throw new NetworkError(`Upload PUT timed out after ${this.timeoutMs}ms`)
      }
      throw new NetworkError(`Upload PUT network error: ${(err as Error).message}`)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async requestSignedDownloadUrl(path: StoragePath): Promise<SignedDownloadResponse> {
    const qs = new URLSearchParams({ app_id: this.appId, path }).toString()
    // Response: { data: "https://res.cloudinary.com/..." }
    const res = await this.request<{ data: string }>(
      'GET',
      `/storage/signed-download-url?${qs}`
    )
    return { downloadUrl: res.data }
  }

  async deleteFile(fileId: FileId): Promise<DeleteResponse> {
    const res = await this.fetch(this.url('/storage/delete'), {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ app_id: this.appId, fileId }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new CloudError(
        `Storage delete failed: ${res.status} ${res.statusText}`,
        'STORAGE_DELETE_FAILED',
        res.status,
        errBody
      )
    }
    // Endpoint returns 200 with empty body — not valid JSON
    return { ok: true }
  }

  async deleteByPath(path: StoragePath): Promise<DeleteResponse> {
    const res = await this.fetch(this.url('/storage/delete'), {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ app_id: this.appId, path }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new CloudError(
        `Storage delete by path failed: ${res.status} ${res.statusText}`,
        'STORAGE_DELETE_FAILED',
        res.status,
        errBody
      )
    }
    return { ok: true }
  }
}

/**
 * Classify an error thrown from the transport into a `TransportFailure`
 * for the retry policy. Pure function — easy to unit-test.
 */
export function classifyTransportError(err: unknown): TransportFailure {
  if (err instanceof NetworkError) {
    if (err.message.includes('timed out')) return { kind: 'timeout' }
    return { kind: 'network', message: err.message }
  }
  if (err instanceof CloudError) {
    const status = (err as { httpStatus?: number; status?: number }).httpStatus
      ?? (err as { status?: number }).status
      ?? 0
    const msg = err.message
    if (status === 401 || status === 403) return { kind: 'unauthorized', status }
    if (status === 404) return { kind: 'not_found', status }
    if (status === 408) return { kind: 'request_timeout', status }
    if (status === 413) return { kind: 'too_large', status, message: msg }
    if (status === 429) return { kind: 'rate_limit', status }
    if (status >= 500 && status <= 599) return { kind: 'server_5xx', status, message: msg }
    if (status >= 400 && status <= 499) return { kind: 'client_4xx', status, message: msg }
    return { kind: 'network', message: msg }
  }
  return { kind: 'network', message: (err as Error)?.message ?? String(err) }
}
