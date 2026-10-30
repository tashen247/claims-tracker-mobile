import { create } from 'zustand';
import type { AuthResponse, User } from '@claims/shared';
import { secureStorage } from '../lib/secure-storage';

const REFRESH_KEY = 'claims.refreshToken';
const USER_KEY = 'claims.user';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (auth: AuthResponse) => Promise<void>;
  clearSession: () => Promise<void>;
  loadStoredSession: () => Promise<{ refreshToken: string; user: User } | null>;
  markSignedOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  refreshToken: null,

  async setSession(auth) {
    // Access token stays in memory; only the refresh token and profile are persisted.
    await secureStorage.setItem(REFRESH_KEY, auth.refreshToken);
    await secureStorage.setItem(USER_KEY, JSON.stringify(auth.user));
    set({
      status: 'signedIn',
      user: auth.user,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
    });
  },

  async clearSession() {
    await secureStorage.deleteItem(REFRESH_KEY);
    await secureStorage.deleteItem(USER_KEY);
    set({ status: 'signedOut', user: null, accessToken: null, refreshToken: null });
  },

  async loadStoredSession() {
    const [refreshToken, userJson] = await Promise.all([
      secureStorage.getItem(REFRESH_KEY),
      secureStorage.getItem(USER_KEY),
    ]);
    if (!refreshToken || !userJson) return null;
    try {
      return { refreshToken, user: JSON.parse(userJson) as User };
    } catch {
      return null;
    }
  },

  markSignedOut() {
    set({ status: 'signedOut' });
  },
}));
