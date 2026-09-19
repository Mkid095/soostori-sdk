/**
 * Centralized path generation for the Soostori storage service.
 *
 * Applications MUST NOT construct storage paths directly. The SDK owns the
 * path format so the backend can apply tenant isolation, retention rules,
 * and provider migration without application code changes.
 *
 * Format (verified format from existing usage):
 *   {tenantPrefix}/{kind}/{yyyy}/{mm}/{fileId}{ext}
 *
 * `tenantPrefix` is `global` for cross-tenant assets or derived from a
 * businessId for tenant-scoped assets.
 *
 * NOTE: the path format is observed from Web app usage; if the FIDScript
 * storage API returns paths in a different shape, this builder must be
 * adapted to match (verified by requestSignedUploadUrl's response.path).
 */

import type { StorageKind } from '@soostori/contracts'

/** Map content type to a small set of allowed extensions. */
export function extForContentType(contentType: string): string {
  const ct = contentType.toLowerCase().split(';')[0]?.trim() ?? ''
  if (ct === 'image/jpeg' || ct === 'image/jpg') return '.jpg'
  if (ct === 'image/png') return '.png'
  if (ct === 'image/webp') return '.webp'
  if (ct === 'image/gif') return '.gif'
  if (ct === 'image/svg+xml') return '.svg'
  if (ct === 'video/mp4') return '.mp4'
  if (ct === 'video/webm') return '.webm'
  if (ct === 'application/pdf') return '.pdf'
  if (ct.startsWith('image/')) return '.bin'
  if (ct.startsWith('video/')) return '.bin'
  return '.bin'
}

/**
 * Build a provider-neutral storage path.
 *
 * Applications cannot override the format. This guarantees:
 *   - tenant isolation (paths are namespaced per business where relevant)
 *   - predictable retention policies (yyyy/mm grouping)
 *   - safe ext derivation (from contentType, never from user filename)
 */
export function buildStoragePath(input: {
  readonly kind: StorageKind
  readonly contentType: string
  readonly fileId: string
  readonly tenantPrefix?: string
  readonly now?: Date
}): string {
  const tenant = input.tenantPrefix ?? 'global'
  const now = input.now ?? new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const ext = extForContentType(input.contentType)
  return `${tenant}/${input.kind}/${yyyy}/${mm}/${input.fileId}${ext}`
}
