import type { Claim, PhotoContentType, PhotoUploadUrlResponse } from '@claims/shared';
import { ApiError } from '../api/client';
import type { QueuedClaim } from './types';

export interface SyncApi {
  createClaim(payload: QueuedClaim['payload'], idempotencyKey: string): Promise<Claim>;
  requestPhotoUploadUrl(
    claimId: string,
    contentType: PhotoContentType,
  ): Promise<PhotoUploadUrlResponse>;
  uploadToSignedUrl(url: string, headers: Record<string, string>, localUri: string): Promise<void>;
}

export interface QueueAccess {
  items(): QueuedClaim[];
  update(localId: string, patch: Partial<QueuedClaim>): void;
  remove(localId: string): void;
}

export interface SyncResult {
  synced: string[];
  failed: string[];
  skipped: string[];
}

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10 * 60_000;

/** Exponential backoff with jitter: ~5s, 10s, 20s ... capped at 10 minutes. */
export function backoffDelay(attempts: number, random: () => number = Math.random): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(exp / 2 + random() * (exp / 2));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Syncs one queued claim. Safe to call repeatedly:
 * - the claim is created with the draft's fixed Idempotency-Key, so a retry after a lost
 *   response returns the same server claim instead of a duplicate;
 * - photos already uploaded are skipped.
 */
export async function syncOne(item: QueuedClaim, api: SyncApi, queue: QueueAccess): Promise<void> {
  let claimId = item.serverClaimId;
  if (!claimId) {
    const claim = await api.createClaim(item.payload, item.idempotencyKey);
    claimId = claim.id;
    queue.update(item.localId, { serverClaimId: claim.id, serverReference: claim.reference });
  }

  const photos = [...item.photos];
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index]!;
    if (photo.uploaded) continue;
    const target = await api.requestPhotoUploadUrl(claimId, photo.contentType);
    await api.uploadToSignedUrl(target.uploadUrl, target.headers, photo.localUri);
    photos[index] = { ...photo, uploaded: true };
    queue.update(item.localId, { photos: [...photos] });
  }
}

/** Processes every due item in the queue. Never throws. */
export async function processQueue(
  queue: QueueAccess,
  api: SyncApi,
  now: () => number = Date.now,
): Promise<SyncResult> {
  const result: SyncResult = { synced: [], failed: [], skipped: [] };

  for (const item of queue.items()) {
    if (item.needsAttention || item.nextAttemptAt > now()) {
      result.skipped.push(item.localId);
      continue;
    }

    queue.update(item.localId, { state: 'syncing' });
    try {
      // Read the latest copy: earlier iterations may have updated it.
      const latest = queue.items().find((i) => i.localId === item.localId) ?? item;
      await syncOne(latest, api, queue);
      queue.remove(item.localId);
      result.synced.push(item.localId);
    } catch (error) {
      const attempts = item.attempts + 1;
      const permanent = error instanceof ApiError && !error.retryable;
      queue.update(item.localId, {
        state: 'failed',
        attempts,
        lastError: describe(error),
        needsAttention: permanent,
        nextAttemptAt: now() + backoffDelay(attempts),
      });
      result.failed.push(item.localId);
      // Offline: no point hammering the rest of the queue.
      if (error instanceof ApiError && error.status === 0) break;
    }
  }

  return result;
}
