import { StyleSheet, Text, View } from 'react-native';
import { CLAIM_STATUS_LABELS, type ClaimStatusEvent } from '@claims/shared';
import { formatDateTime } from '../../lib/dates';
import { spacing, useTheme } from '../../theme';

export function Timeline({ events }: { events: ClaimStatusEvent[] }) {
  const { colors, status } = useTheme();
  return (
    <View accessibilityLabel="Status timeline">
      {events.map((event, index) => {
        const last = index === events.length - 1;
        return (
          <View
            key={event.id}
            style={styles.item}
            accessible
            accessibilityLabel={`${CLAIM_STATUS_LABELS[event.toStatus]} on ${formatDateTime(event.createdAt)} by ${event.actor.fullName}${event.note ? `. Note: ${event.note}` : ''}`}
          >
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: status[event.toStatus].fg }]} />
              {!last ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
            </View>
            <View style={styles.body}>
              <Text style={[styles.title, { color: colors.text }]}>
                {CLAIM_STATUS_LABELS[event.toStatus]}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {formatDateTime(event.createdAt)} ·{' '}
                {event.actor.role === 'assessor'
                  ? `Assessor ${event.actor.fullName}`
                  : event.actor.fullName}
              </Text>
              {event.note ? (
                <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
                  <Text style={{ color: colors.text }}>{event.note}</Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 16 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  line: { width: 2, flex: 1, marginVertical: 2 },
  body: { flex: 1, paddingBottom: spacing.lg, gap: 2 },
  title: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13 },
  note: { marginTop: spacing.xs, padding: spacing.md, borderRadius: 8 },
});
