import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { API_URL } from '../config';

// "Online" means our API is reachable, not just that the device has a network.
NetInfo.configure({
  reachabilityUrl: `${API_URL}/health`,
  reachabilityTest: async (response) => response.status === 200,
  reachabilityShortTimeout: 5_000,
  reachabilityLongTimeout: 30_000,
});

interface ConnectivityState {
  isOnline: boolean;
  setOnline: (online: boolean) => void;
}

export const useConnectivity = create<ConnectivityState>((set) => ({
  isOnline: true,
  setOnline: (isOnline) => set({ isOnline }),
}));

export function subscribeToConnectivity(onReconnect: () => void): () => void {
  return NetInfo.addEventListener((state) => {
    const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
    const wasOnline = useConnectivity.getState().isOnline;
    useConnectivity.getState().setOnline(online);
    if (online && !wasOnline) onReconnect();
  });
}
