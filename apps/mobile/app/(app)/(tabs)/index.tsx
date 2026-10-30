import { Redirect, router } from 'expo-router';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { useClaims } from '@/api/queries';
import { useAuthStore } from '@/auth/store';
import { Button } from '@/components/ui';
import { ClaimList } from '@/features/claims/ClaimList';
import { useClaimQueue } from '@/offline/queue-store';
import { runSync } from '@/offline/useOfflineSync';
import type { QueuedClaim } from '@/offline/types';
import { spacing } from '@/theme';

export default function MyClaimsScreen() {
  const role = useAuthStore((s) => s.user?.role);
  const drafts = useClaimQueue((s) => s.items);
  const retryNow = useClaimQueue((s) => s.retryNow);
  const remove = useClaimQueue((s) => s.remove);
  const query = useClaims();

  if (role === 'assessor') return <Redirect href="/queue" />;

  const claims = query.data?.pages.flatMap((p) => p.items) ?? [];

  const discard = (draft: QueuedClaim) => {
    const doIt = () => remove(draft.localId);
    if (Platform.OS === 'web') return doIt();
    Alert.alert('Discard this claim?', 'It has not been accepted by the server.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: doIt },
    ]);
  };

  return (
    <View style={styles.flex}>
      <ClaimList
        claims={claims}
        drafts={drafts}
        loading={query.isLoading}
        error={query.error?.message}
        refreshing={query.isRefetching}
        onRefresh={() => {
          void runSync();
          void query.refetch();
        }}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onPressClaim={(claim) =>
          router.push({ pathname: '/claims/[id]', params: { id: claim.id } })
        }
        onRetryDraft={(draft) => {
          retryNow(draft.localId);
          void runSync();
        }}
        onDiscardDraft={discard}
        emptyMessage="Tap “New claim” to report a breakdown, a funeral or a legal matter."
      />
      <View style={styles.fab}>
        <Button label="+ New claim" onPress={() => router.push('/claims/new')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
});
