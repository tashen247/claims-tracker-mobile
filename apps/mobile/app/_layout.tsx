import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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

  const signedIn = status === 'signedIn';

  // The navigator has to stay mounted while the session loads. Returning only a
  // spinner makes Expo Router treat "/" as an unmatched route.
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
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      {status === 'loading' ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
          <LoadingState label="Starting" />
        </View>
      ) : null}
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
