import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CreateClaimRequest } from '@claims/shared';
import { newIdempotencyKey, newLocalId } from '../lib/ids';
import type { DraftPhoto, QueuedClaim } from './types';

interface EnqueueInput {
  payload: CreateClaimRequest;
  photos: Omit<DraftPhoto, 'uploaded'>[];
  policyLabel: string;
}

interface QueueStore {
  items: QueuedClaim[];
  enqueue: (input: EnqueueInput) => QueuedClaim;
  update: (localId: string, patch: Partial<QueuedClaim>) => void;
  remove: (localId: string) => void;
  retryNow: (localId: string) => void;
}

export const useClaimQueue = create<QueueStore>()(
  persist(
    (set) => ({
      items: [],
      enqueue(input) {
        const item: QueuedClaim = {
          localId: newLocalId(),
          idempotencyKey: newIdempotencyKey(),
          payload: input.payload,
          photos: input.photos.map((p) => ({ ...p, uploaded: false })),
          policyLabel: input.policyLabel,
          state: 'pending',
          attempts: 0,
          nextAttemptAt: 0,
          needsAttention: false,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ items: [item, ...s.items] }));
        return item;
      },
      update(localId, patch) {
        set((s) => ({
          items: s.items.map((i) => (i.localId === localId ? { ...i, ...patch } : i)),
        }));
      },
      remove(localId) {
        set((s) => ({ items: s.items.filter((i) => i.localId !== localId) }));
      },
      retryNow(localId) {
        set((s) => ({
          items: s.items.map((i) =>
            i.localId === localId
              ? { ...i, state: 'pending', nextAttemptAt: 0, needsAttention: false }
              : i,
          ),
        }));
      },
    }),
    {
      name: 'claims.offline-queue.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
      // An app killed mid-sync leaves items in "syncing"; make them eligible again.
      onRehydrateStorage: () => (state) => {
        state?.items.forEach((i) => {
          if (i.state === 'syncing') state.update(i.localId, { state: 'pending' });
        });
      },
    },
  ),
);

export const queueAccess = {
  items: () => useClaimQueue.getState().items,
  update: (localId: string, patch: Partial<QueuedClaim>) =>
    useClaimQueue.getState().update(localId, patch),
  remove: (localId: string) => useClaimQueue.getState().remove(localId),
};
