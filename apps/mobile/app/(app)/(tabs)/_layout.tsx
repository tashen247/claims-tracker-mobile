import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useAuthStore } from '@/auth/store';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useClaimQueue } from '@/offline/queue-store';
import { useTheme } from '@/theme';

function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return (
    <Text accessible={false} style={{ color, fontSize: 18 }}>
      {glyph}
    </Text>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const role = useAuthStore((s) => s.user?.role);
  const pending = useClaimQueue((s) => s.items.length);
  const isAssessor = role === 'assessor';

  return (
    <>
      <OfflineBanner />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'My claims',
            href: isAssessor ? null : undefined,
            tabBarBadge: pending > 0 ? pending : undefined,
            tabBarIcon: ({ color }) => <TabIcon glyph="▤" color={color} />,
          }}
        />
        <Tabs.Screen
          name="policies"
          options={{
            title: 'Policies',
            href: isAssessor ? null : undefined,
            tabBarIcon: ({ color }) => <TabIcon glyph="◈" color={color} />,
          }}
        />
        <Tabs.Screen
          name="queue"
          options={{
            title: 'Review queue',
            href: isAssessor ? undefined : null,
            tabBarIcon: ({ color }) => <TabIcon glyph="☰" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}
