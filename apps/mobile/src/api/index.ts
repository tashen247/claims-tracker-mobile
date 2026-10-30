import { API_URL } from '../config';
import { useAuthStore } from '../auth/store';
import { uploadFile } from '../lib/upload-file';
import { ApiError, createApiClient } from './client';

export { ApiError } from './client';

/** App-wide API client wired to the auth store for bearer tokens and silent refresh. */
export const api = createApiClient({
  baseUrl: API_URL,
  uploadFile,
  tokens: {
    getAccessToken: () => useAuthStore.getState().accessToken,
    async refresh() {
      const { refreshToken, setSession, clearSession } = useAuthStore.getState();
      if (!refreshToken) return null;
      try {
        const auth = await api.refresh(refreshToken);
        await setSession(auth);
        return auth.accessToken;
      } catch (error) {
        // Offline: keep the session (so queued drafts can sync later) and surface a retryable error.
        if (error instanceof ApiError && error.retryable) throw error;
        await clearSession();
        return null;
      }
    },
    onSessionExpired() {
      // Handled in refresh(); nothing extra needed.
    },
  },
});

/** Restores a stored session on app launch. Works offline using the cached profile. */
export async function bootstrapSession(): Promise<void> {
  const store = useAuthStore.getState();
  const stored = await store.loadStoredSession();
  if (!stored) {
    store.markSignedOut();
    return;
  }
  try {
    const auth = await api.refresh(stored.refreshToken);
    await store.setSession(auth);
  } catch (error) {
    if (error instanceof ApiError && error.retryable) {
      // Offline launch: show the app with the cached profile; tokens refresh on reconnect.
      useAuthStore.setState({
        status: 'signedIn',
        user: stored.user,
        refreshToken: stored.refreshToken,
        accessToken: null,
      });
    } else {
      await store.clearSession();
    }
  }
}

export async function signOut(): Promise<void> {
  const { refreshToken, clearSession } = useAuthStore.getState();
  if (refreshToken) {
    await api.logout(refreshToken).catch(() => undefined);
  }
  await clearSession();
}
