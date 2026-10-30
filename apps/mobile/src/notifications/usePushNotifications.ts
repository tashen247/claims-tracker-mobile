import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from '../api';
import { useAuthStore } from '../auth/store';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushToken(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('claims', {
      name: 'Claim updates',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const status = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!status.granted) return null;

  const projectId =
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    Constants.easConfig?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return token.data;
}

function claimIdFrom(data: unknown): string | null {
  const id = (data as { claimId?: unknown } | null)?.claimId;
  return typeof id === 'string' ? id : null;
}

/** Registers the device for claim status pushes and routes taps to the claim. */
export function usePushNotifications(): void {
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!signedIn) return;
    registerForPushToken()
      .then((token) => {
        if (token) return api.registerPushToken(token, Platform.OS as 'ios' | 'android');
        return undefined;
      })
      .catch((error: unknown) => console.warn('Push registration failed', error));
  }, [signedIn]);

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ['claims'] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      const claimId = claimIdFrom(response.notification.request.content.data);
      if (claimId) router.push({ pathname: '/claims/[id]', params: { id: claimId } });
    });
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [queryClient]);
}
