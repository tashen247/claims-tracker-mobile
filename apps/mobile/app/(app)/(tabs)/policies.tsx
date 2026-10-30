import { FlatList, StyleSheet, Text, View } from 'react-native';
import { POLICY_TYPE_LABELS, formatZar } from '@claims/shared';
import { usePolicies } from '@/api/queries';
import { Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';

export default function PoliciesScreen() {
  const { colors } = useTheme();
  const query = usePolicies();

  if (query.isLoading) return <LoadingState label="Loading policies" />;
  if (query.error)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  return (
    <FlatList
      data={query.data?.items ?? []}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.content}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      ListEmptyComponent={
        <EmptyState title="No policies" message="Policies linked to your account appear here." />
      }
      renderItem={({ item }) => (
        <Card>
          <View style={styles.row}>
            <Text style={[styles.title, { color: colors.text }]}>
              {POLICY_TYPE_LABELS[item.type]}
            </Text>
            <Text
              style={{
                color: item.status === 'active' ? colors.success : colors.warning,
                fontWeight: '700',
                textTransform: 'capitalize',
              }}
            >
              {item.status}
            </Text>
          </View>
          <Text style={{ color: colors.textMuted }}>{item.number}</Text>
          <Text style={[styles.description, { color: colors.text }]}>{item.description}</Text>
          <View style={styles.row}>
            <Text style={{ color: colors.textMuted }}>Since {formatDate(item.startDate)}</Text>
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              Cover {formatZar(item.coverAmountCents)}
            </Text>
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  description: { marginVertical: spacing.sm, fontSize: 15 },
});
