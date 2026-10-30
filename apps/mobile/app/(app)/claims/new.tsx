import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { POLICY_TYPE_LABELS } from '@claims/shared';
import { usePolicies } from '@/api/queries';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/ui';
import { ClaimForm, type ClaimFormSubmit } from '@/features/claims/ClaimForm';
import { pickPhoto } from '@/features/claims/pick-photo';
import { useConnectivity } from '@/offline/connectivity';
import { persistDraftPhoto } from '@/offline/photos';
import { useClaimQueue } from '@/offline/queue-store';
import { runSync } from '@/offline/useOfflineSync';
import { useTheme } from '@/theme';

export default function NewClaimScreen() {
  const { colors } = useTheme();
  const policies = usePolicies();
  const enqueue = useClaimQueue((s) => s.enqueue);
  const online = useConnectivity((s) => s.isOnline);
  const [saving, setSaving] = useState(false);

  async function handleSubmit({ request, photos, policy }: ClaimFormSubmit) {
    setSaving(true);
    try {
      // Every claim goes through the on-device queue: online it syncs immediately,
      // offline it waits. One code path, always duplicate-safe.
      const storedPhotos = await Promise.all(
        photos.map(async (p) => ({
          localUri: await persistDraftPhoto(p.uri),
          contentType: p.contentType,
        })),
      );
      enqueue({
        payload: request,
        photos: storedPhotos,
        policyLabel: `${POLICY_TYPE_LABELS[policy.type]} ${policy.number}`,
      });
      void runSync();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  if (policies.isLoading) return <LoadingState label="Loading policies" />;
  if (policies.error || !policies.data) {
    return (
      <ErrorState
        message={
          online
            ? (policies.error?.message ?? 'Could not load your policies')
            : 'Your policies have not been downloaded yet. Connect once to start claims offline.'
        }
        onRetry={() => void policies.refetch()}
      />
    );
  }

  return (
    <Screen>
      {!online ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.warning, marginBottom: 16, fontWeight: '600' }}
        >
          You're offline. This claim will be saved on your phone and sent automatically when you're
          back online.
        </Text>
      ) : null}
      <ClaimForm
        policies={policies.data.items}
        onSubmit={handleSubmit}
        pickPhoto={pickPhoto}
        submitting={saving}
      />
    </Screen>
  );
}
