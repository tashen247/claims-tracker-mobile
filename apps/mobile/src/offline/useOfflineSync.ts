import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { api } from '../api';
import { useAuthStore } from '../auth/store';
import { subscribeToConnectivity, useConnectivity } from './connectivity';
import { deleteDraftPhoto } from './photos';
import { queueAccess, useClaimQueue } from './queue-store';
import { processQueue } from './sync';

const POLL_MS = 15_000;

let running: Promise<unknown> | null = null;

/** Runs the queue once; concurrent callers share the same run. */
export function runSync(): Promise<unknown> {
  running ??= processQueue(
    {
      ...queueAccess,
      remove(localId) {
        const item = queueAccess.items().find((i) => i.localId === localId);
        item?.photos.forEach((p) => deleteDraftPhoto(p.localUri));
        queueAccess.remove(localId);
      },
    },
    api,
  ).finally(() => {
    running = null;
  });
  return running;
}

/** Mount once at the app root: syncs on reconnect, on foreground and on a timer. */
export function useOfflineSync(): void {
  const queryClient = useQueryClient();
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  const hasItems = useClaimQueue((s) => s.items.length > 0);

  const sync = useCallback(async () => {
    if (!signedIn || !useConnectivity.getState().isOnline) return;
    const before = useClaimQueue.getState().items.length;
    await runSync();
    if (useClaimQueue.getState().items.length !== before) {
      await queryClient.invalidateQueries({ queryKey: ['claims'] });
    }
  }, [queryClient, signedIn]);

  useEffect(() => subscribeToConnectivity(() => void sync()), [sync]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => sub.remove();
  }, [sync]);

  useEffect(() => {
    if (!hasItems) return undefined;
    void sync();
    const timer = setInterval(() => void sync(), POLL_MS);
    return () => clearInterval(timer);
  }, [hasItems, sync]);
}
