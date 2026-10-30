import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CLAIM_STATUSES, CLAIM_STATUS_LABELS, type ClaimStatus } from '@claims/shared';
import { useClaims } from '@/api/queries';
import { ChipSelect } from '@/components/ui';
import { ClaimList } from '@/features/claims/ClaimList';
import { spacing } from '@/theme';

type Filter = ClaimStatus | 'all';

export default function ReviewQueueScreen() {
  const [filter, setFilter] = useState<Filter>('submitted');
  const query = useClaims(filter === 'all' ? undefined : filter);
  const claims = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={styles.flex}>
      <View style={styles.filters}>
        <ChipSelect<Filter>
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          options={[
            ...CLAIM_STATUSES.map((s) => ({ value: s, label: CLAIM_STATUS_LABELS[s] })),
            { value: 'all', label: 'All' },
          ]}
        />
      </View>
      <ClaimList
        claims={claims}
        loading={query.isLoading}
        error={query.error?.message}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onPressClaim={(claim) =>
          router.push({ pathname: '/claims/[id]', params: { id: claim.id } })
        }
        emptyTitle="Queue is clear"
        emptyMessage="No claims with this status right now."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, marginBottom: -spacing.md },
});
