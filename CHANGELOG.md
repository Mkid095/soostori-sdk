# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **`@soostori/auth`**: `signInWithGoogleIdToken(params)` — Mobile Google ID-token authentication method. Mobile platforms use `GoogleSignin.signIn()` to obtain a Google ID token, then pass it here along with the configured FIDScript `clientName`. Bypasses the browser PKCE redirect flow entirely. Emits `SIGNED_IN` on success.
- **`@soostori/auth`**: `AuthApiClient.signInWithIdToken(clientName, idToken)` — interface method for the Mobile FIDScript `db.auth.signInWithIdToken` call.
- **`@soostori/auth`**: `GoogleSignInResult.accountStatus?: 'provisioned' | 'active'` — distinguishes pre-activated from active accounts.

### Fixed

- **`@soostori/auth`**: Corrected `handleOAuthCallback` method signature (was corrupted by prior edit).

### Changed

- **`@soostori/auth`**: No functional changes to existing `signInWithGoogle` / `handleOAuthCallback` browser PKCE flow.

### Tests

- **`@soostori/auth`**: 7 new tests for Mobile Google ID-token flow (31 total, 31 passing).

---

## [0.1.0-alpha.3] — 2026-09-08

### Added

- **`@soostori/auth`**: Full `CloudAuth` class with PKCE S256 browser OAuth, email/password registration and verification, password reset, session refresh with rotation, trusted device management, offline session caching, event emission.
- **`@soostori/auth`**: `PlatformAuthAdapter` interface — abstracts `openOAuthBrowser`, `getSecureStorage`, `getNetworkStatus`, `randomString`.
- **`@soostori/auth`**: `AuthApiClient` interface — REST contract for auth backend.
- **`@soostori/auth`**: `AuthResult<T>` discriminated union: `{ ok: true; data: T } | { ok: false; error: AuthError }`.
- **`@soostori/auth`**: 24 unit tests for all auth flows.
