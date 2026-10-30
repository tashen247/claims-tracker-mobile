import { StyleSheet, Text, View } from 'react-native';
import { signOut } from '@/api';
import { useAuthStore } from '@/auth/store';
import { Screen } from '@/components/Screen';
import { Button, Card, SectionTitle } from '@/components/ui';
import { API_URL } from '@/config';
import { useConnectivity } from '@/offline/connectivity';
import { useClaimQueue } from '@/offline/queue-store';
import { spacing, useTheme } from '@/theme';

export default function ProfileScreen() {
  const { colors, scheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const pending = useClaimQueue((s) => s.items.length);
  const online = useConnectivity((s) => s.isOnline);

  const rows: [string, string][] = [
    ['Role', user?.role === 'assessor' ? 'Claims assessor' : 'Policyholder'],
    ['Connection', online ? 'Online' : 'Offline'],
    ['Claims waiting to sync', String(pending)],
    ['Appearance', `${scheme === 'dark' ? 'Dark' : 'Light'} (follows system)`],
    ['Server', API_URL],
  ];

  return (
    <Screen>
      <Card>
        <Text accessibilityRole="header" style={[styles.name, { color: colors.text }]}>
          {user?.fullName}
        </Text>
        <Text style={{ color: colors.textMuted }}>{user?.email}</Text>
      </Card>
      <SectionTitle>Details</SectionTitle>
      <Card>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
            <Text style={{ color: colors.textMuted }}>{label}</Text>
            <Text
              style={{ color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}
            >
              {value}
            </Text>
          </View>
        ))}
      </Card>
      {pending > 0 ? (
        <Text style={[styles.warning, { color: colors.warning }]}>
          Claims waiting to sync stay on this device after you log out and are sent next time you
          log in.
        </Text>
      ) : null}
      <Button
        label="Log out"
        variant="secondary"
        onPress={() => void signOut()}
        style={styles.logout}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 20, fontWeight: '700', marginBottom: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  warning: { marginTop: spacing.lg },
  logout: { marginTop: spacing.xl },
});
