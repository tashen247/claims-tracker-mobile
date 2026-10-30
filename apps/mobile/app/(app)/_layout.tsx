import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="claims/new" options={{ title: 'New claim', presentation: 'modal' }} />
      <Stack.Screen name="claims/[id]" options={{ title: 'Claim' }} />
    </Stack>
  );
}
