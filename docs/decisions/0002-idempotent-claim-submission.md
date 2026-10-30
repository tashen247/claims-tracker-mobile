# 0002. Idempotent claim submission

- Status: accepted
- Date: 2026-10-30

## Context

Claims are submitted from phones on unreliable networks. A request can succeed on the server while
the response is lost, and the app will retry. Without protection that creates duplicate claims, which
for an insurer means duplicate payouts or manual clean-up.

## Decision

`POST /v1/claims` requires an `Idempotency-Key` header.

- The key is generated once on the device when a claim is saved and reused for every retry.
- Keys are unique per user (`unique(user_id, idempotency_key)`), so one customer's key can never
  return another customer's claim.
- The server stores a SHA-256 hash of the canonicalised request body with the claim.
- First request: `201 Created`. Same key and same body: `200 OK` with the original claim and an
  `Idempotent-Replayed: true` header. Same key, different body: `409 IDEMPOTENCY_KEY_REUSED`.
- The insert uses `ON CONFLICT DO NOTHING`; a request that loses a concurrent race reads back the
  winner's row. The integration suite fires eight concurrent requests with one key and asserts a
  single claim exists.

## Consequences

- Retries are always safe, which makes the offline queue (ADR 0003) simple.
- Keys are kept with the claim indefinitely. That is cheap at this scale; a production system might
  expire replay protection after, say, 30 days.
