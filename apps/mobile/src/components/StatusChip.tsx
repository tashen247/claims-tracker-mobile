import { StyleSheet, Text, View } from 'react-native';
import { CLAIM_STATUS_LABELS, type ClaimStatus } from '@claims/shared';
import { radius, spacing, useTheme } from '../theme';

export function StatusChip({ status }: { status: ClaimStatus }) {
  const { status: colors } = useTheme();
  const label = CLAIM_STATUS_LABELS[status];
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${label}`}
      style={[styles.chip, { backgroundColor: colors[status].bg }]}
    >
      <Text style={[styles.text, { color: colors[status].fg }]}>{label}</Text>
    </View>
  );
}

export function PendingChip({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Sync: ${label}`}
      style={[styles.chip, { backgroundColor: colors.banner }]}
    >
      <Text style={[styles.text, { color: colors.warning }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  text: { fontSize: 12, fontWeight: '700' },
});
