# 0003. Offline-first claim queue

- Status: accepted
- Date: 2026-10-30

## Context

Policyholders often start a claim where it happened: a roadside breakdown, a rural funeral, a
hospital basement. Signal is unreliable, and losing a half-filled claim with photos is a poor
experience.

## Decision

Every new claim, online or not, is written to an on-device queue (Zustand persisted to AsyncStorage)
and then synced. There is one submission path, not an "online path" and an "offline path".

Each queued item holds the payload, a fixed idempotency key, the local photo URIs (copied out of
the picker cache into the app's documents folder so the OS cannot purge them), the server claim ID
once known and per-photo upload flags.

The sync engine (`src/offline/sync.ts`) is a pure function over a queue and an API interface:

1. Create the claim with the stored idempotency key (safe to repeat, see ADR 0002).
2. Upload each photo not yet marked uploaded (pre-signed URL, then PUT to S3).
3. Remove the item.

It runs on reconnect (NetInfo, with reachability checked against the API's `/health`), when the
app returns to the foreground and every 15 s while items are waiting. Failures back off
exponentially with jitter (5 s doubling to a 10-minute cap). Network errors, timeouts, 429 and 5xx
are retried; other 4xx responses mark the item "needs attention" and it waits for the user to retry
or discard it.

## Consequences

- Duplicate-safe by construction; the queue tests cover lost responses, partial photo uploads and
  server rejections.
- If the app dies between requesting an upload URL and finishing the PUT, a retry requests a new
  URL and the earlier photo row has no object behind it. The five-photo cap bounds this; a fuller
  solution is a client-supplied photo ID on the upload-url request.
- The access token is not persisted. An offline launch restores the session from the cached profile
  and refreshes tokens on reconnect.
