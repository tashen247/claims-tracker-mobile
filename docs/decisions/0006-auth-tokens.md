# 0006. Short-lived access tokens with rotating refresh tokens

- Status: accepted
- Date: 2026-10-30

## Decision

- Access tokens: JWT (HS256), 15 minutes, carrying the user ID and role. Kept in memory only.
- Refresh tokens: 48 random bytes, opaque, 30 days. Only a SHA-256 hash is stored. On the device they
  live in the iOS Keychain / Android Keystore via Expo SecureStore.
- Every refresh rotates the token. Tokens share a family ID; presenting an already-rotated token
  revokes the whole family (reuse detection for stolen tokens).
- Login compares against a dummy bcrypt hash for unknown emails so response time does not reveal
  which emails have accounts. Auth endpoints are rate limited, backed by Redis in AWS so limits hold
  across tasks.
- Roles are enforced server-side (`requireRole`); hiding assessor screens in the app is convenience,
  not security. Claims belonging to someone else return 404, not 403.
