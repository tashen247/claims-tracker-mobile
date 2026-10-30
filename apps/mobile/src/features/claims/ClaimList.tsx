import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { CLAIM_TYPE_LABELS, formatZar, type Claim } from '@claims/shared';
import { PendingChip, StatusChip } from '../../components/StatusChip';
import { Button, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { formatDate } from '../../lib/dates';
import type { QueuedClaim } from '../../offline/types';
import { radius, spacing, useTheme } from '../../theme';

type Row = { kind: 'draft'; draft: QueuedClaim } | { kind: 'claim'; claim: Claim };

export interface ClaimListProps {
  claims: Claim[];
  drafts?: QueuedClaim[];
  loading?: boolean;
  error?: string | null;
  refreshing?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  onRefresh?: () => void;
  onEndReached?: () => void;
  onPressClaim: (claim: Claim) => void;
  onRetryDraft?: (draft: QueuedClaim) => void;
  onDiscardDraft?: (draft: QueuedClaim) => void;
  ListHeaderComponent?: React.ReactElement;
}

function draftLabel(draft: QueuedClaim): string {
  if (draft.needsAttention) return 'Needs attention';
  if (draft.state === 'syncing') return 'Sending…';
  if (draft.serverClaimId) return 'Uploading photos';
  if (draft.attempts > 0) return 'Waiting for connection';
  return 'Waiting to send';
}

export function ClaimList({
  claims,
  drafts = [],
  loading,
  error,
  refreshing = false,
  emptyTitle = 'No claims yet',
  emptyMessage = 'Claims you submit will appear here with their latest status.',
  onRefresh,
  onEndReached,
  onPressClaim,
  onRetryDraft,
  onDiscardDraft,
  ListHeaderComponent,
}: ClaimListProps) {
  const { colors } = useTheme();
  const rows: Row[] = [
    ...drafts.map((draft) => ({ kind: 'draft' as const, draft })),
    ...claims.map((claim) => ({ kind: 'claim' as const, claim })),
  ];

  if (loading && rows.length === 0) return <LoadingState label="Loading claims" />;
  if (error && rows.length === 0) return <ErrorState message={error} onRetry={onRefresh} />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => (row.kind === 'draft' ? row.draft.localId : row.claim.id)}
      contentContainerStyle={rows.length === 0 ? styles.emptyContainer : styles.content}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={<EmptyState title={emptyTitle} message={emptyMessage} />}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        ) : undefined
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      renderItem={({ item }) => {
        if (item.kind === 'draft') {
          const { draft } = item;
          return (
            <View
              testID={`draft-${draft.localId}`}
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.warning },
              ]}
            >
              <View style={styles.row}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {draft.serverReference ?? 'New claim'} · {CLAIM_TYPE_LABELS[draft.payload.type]}
                </Text>
                <PendingChip label={draftLabel(draft)} />
              </View>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {draft.policyLabel} · {formatZar(draft.payload.amountCents)}
              </Text>
              {draft.needsAttention && draft.lastError ? (
                <Text style={[styles.meta, { color: colors.danger }]}>{draft.lastError}</Text>
              ) : (
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  Saved on this device. It sends automatically when you're online.
                </Text>
              )}
              {draft.needsAttention ? (
                <View style={styles.actions}>
                  {onRetryDraft ? (
                    <Button label="Retry" variant="secondary" onPress={() => onRetryDraft(draft)} />
                  ) : null}
                  {onDiscardDraft ? (
                    <Button label="Discard" variant="ghost" onPress={() => onDiscardDraft(draft)} />
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }

        const { claim } = item;
        return (
          <Pressable
            testID={`claim-${claim.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Claim ${claim.reference}, ${CLAIM_TYPE_LABELS[claim.type]}, ${formatZar(claim.amountCents)}`}
            accessibilityHint="Opens claim details"
            onPress={() => onPressClaim(claim)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={styles.row}>
              <Text style={[styles.title, { color: colors.text }]}>{claim.reference}</Text>
              <StatusChip status={claim.status} />
            </View>
            <Text style={[styles.subtitle, { color: colors.text }]}>
              {CLAIM_TYPE_LABELS[claim.type]}
            </Text>
            <View style={styles.row}>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                Incident {formatDate(claim.incidentDate)}
              </Text>
              <Text style={[styles.amount, { color: colors.text }]}>
                {formatZar(claim.amountCents)}
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  emptyContainer: { flexGrow: 1 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  subtitle: { fontSize: 15 },
  meta: { fontSize: 13 },
  amount: { fontSize: 15, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
