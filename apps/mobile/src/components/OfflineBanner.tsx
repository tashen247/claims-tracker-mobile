import { StyleSheet, Text, View } from 'react-native';
import { useConnectivity } from '../offline/connectivity';
import { spacing, useTheme } from '../theme';

export function OfflineBanner() {
  const isOnline = useConnectivity((s) => s.isOnline);
  const { colors } = useTheme();
  if (isOnline) return null;
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: colors.banner }]}>
      <Text style={{ color: colors.warning, fontWeight: '600' }}>
        You're offline. New claims are saved on this device and sent when you reconnect.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
