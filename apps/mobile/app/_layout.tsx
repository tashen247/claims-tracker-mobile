import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError, bootstrapSession } from '@/api';
import { useAuthStore } from '@/auth/store';
import { LoadingState } from '@/components/ui';
import { usePushNotifications } from '@/notifications/usePushNotifications';
import { useOfflineSync } from '@/offline/useOfflineSync';
import { useTheme } from '@/theme';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) =>
          failureCount < 2 && !(error instanceof ApiError && !error.retryable),
      },
    },
  });
}

function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const { colors, scheme } = useTheme();
  useOfflineSync();
  usePushNotifications();

  useEffect(() => {
    void bootstrapSession();
  }, []);

  if (status === 'loading') return <LoadingState label="Starting" />;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={status !== 'signedIn'}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RootNavigator />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
