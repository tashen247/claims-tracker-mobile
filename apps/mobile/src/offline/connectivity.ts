import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';

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
