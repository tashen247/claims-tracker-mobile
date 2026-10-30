import type { CreateClaimRequest, PhotoContentType } from '@claims/shared';

export interface DraftPhoto {
  localUri: string;
  contentType: PhotoContentType;
  uploaded: boolean;
}

export type QueueState = 'pending' | 'syncing' | 'failed';

/** A claim captured on the device that has not been fully synced (claim + photos) yet. */
export interface QueuedClaim {
  localId: string;
  /** Generated once when the draft is saved, reused on every retry. */
  idempotencyKey: string;
  payload: CreateClaimRequest;
  photos: DraftPhoto[];
  policyLabel: string;
  serverClaimId?: string;
  serverReference?: string;
  state: QueueState;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  /** True when the server rejected the draft; it won't retry until the user acts. */
  needsAttention: boolean;
  createdAt: string;
}
