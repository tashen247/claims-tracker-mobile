import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  CLAIM_STATUS_LABELS,
  CLAIM_STATUS_TRANSITIONS,
  CLAIM_TYPE_LABELS,
  POLICY_TYPE_LABELS,
  formatZar,
  updateClaimStatusRequestSchema,
  type ClaimDetail,
  type ClaimStatus,
  type PolicyType,
} from '@claims/shared';
import { useClaim, useUpdateClaimStatus } from '@/api/queries';
import { useAuthStore } from '@/auth/store';
import { Screen } from '@/components/Screen';
import { StatusChip } from '@/components/StatusChip';
import {
  Button,
  Card,
  ChipSelect,
  ErrorState,
  LoadingState,
  SectionTitle,
  TextField,
} from '@/components/ui';
import { Timeline } from '@/features/claims/Timeline';
import { formatDate } from '@/lib/dates';
import { radius, spacing, useTheme } from '@/theme';

function AssessorPanel({ claim }: { claim: ClaimDetail }) {
  const { colors } = useTheme();
  const options = CLAIM_STATUS_TRANSITIONS[claim.status];
  const [status, setStatus] = useState<ClaimStatus | undefined>(options[0]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateClaimStatus(claim.id);

  if (options.length === 0) {
    return (
      <Text style={{ color: colors.textMuted }}>
        This claim is closed. No further changes are possible.
      </Text>
    );
  }

  async function submit() {
    const parsed = updateClaimStatusRequestSchema.safeParse({ status, note });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }
    setError(null);
    try {
      await mutation.mutateAsync(parsed.data);
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  return (
    <Card>
      <ChipSelect
        label="Move to"
        value={status}
        onChange={setStatus}
        options={options.map((s) => ({ value: s, label: CLAIM_STATUS_LABELS[s] }))}
      />
      <TextField
        label="Note (required, visible to the policyholder)"
        multiline
        value={note}
        onChangeText={setNote}
        maxLength={1000}
        error={error ?? undefined}
      />
      <Button
        label={status ? `Mark as ${CLAIM_STATUS_LABELS[status]}` : 'Update status'}
        variant={status === 'rejected' ? 'danger' : 'primary'}
        loading={mutation.isPending}
        onPress={() => void submit()}
      />
    </Card>
  );
}

export default function ClaimDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const role = useAuthStore((s) => s.user?.role);
  const query = useClaim(id);

  if (query.isLoading) return <LoadingState label="Loading claim" />;
  if (query.error || !query.data) {
    return (
      <ErrorState
        message={query.error?.message ?? 'Claim not found'}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const claim = query.data;

  const facts: [string, string][] = [
    ['Type', CLAIM_TYPE_LABELS[claim.type]],
    [
      'Policy',
      `${POLICY_TYPE_LABELS[claim.policy.type as PolicyType] ?? claim.policy.type} · ${claim.policy.number}`,
    ],
    ['Incident date', formatDate(claim.incidentDate)],
    ['Submitted', formatDate(claim.createdAt)],
  ];
  if (role === 'assessor')
    facts.unshift(['Claimant', `${claim.claimant.fullName} (${claim.claimant.email})`]);

  return (
    <Screen>
      <Stack.Screen options={{ title: claim.reference }} />
      <View style={styles.header}>
        <View style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.textMuted }}>Amount claimed</Text>
          <Text accessibilityRole="header" style={[styles.amount, { color: colors.text }]}>
            {formatZar(claim.amountCents)}
          </Text>
        </View>
        <StatusChip status={claim.status} />
      </View>

      <Card>
        {facts.map(([label, value]) => (
          <View
            key={label}
            style={styles.fact}
            accessible
            accessibilityLabel={`${label}: ${value}`}
          >
            <Text style={{ color: colors.textMuted }}>{label}</Text>
            <Text style={[styles.factValue, { color: colors.text }]}>{value}</Text>
          </View>
        ))}
        <Text style={[styles.description, { color: colors.text }]}>{claim.description}</Text>
      </Card>

      {claim.photos.length > 0 ? (
        <>
          <SectionTitle>Photos</SectionTitle>
          <View style={styles.photos}>
            {claim.photos.map((photo, index) => (
              <Image
                key={photo.id}
                source={{ uri: photo.url }}
                style={[styles.photo, { backgroundColor: colors.surfaceMuted }]}
                contentFit="cover"
                accessibilityLabel={`Claim photo ${index + 1}`}
              />
            ))}
          </View>
        </>
      ) : null}

      {role === 'assessor' ? (
        <>
          <SectionTitle>Assessment</SectionTitle>
          <AssessorPanel claim={claim} />
        </>
      ) : null}

      <SectionTitle>Timeline</SectionTitle>
      <Timeline events={[...claim.events].reverse()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  amount: { fontSize: 28, fontWeight: '800' },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  factValue: { fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  description: { marginTop: spacing.md, fontSize: 15, lineHeight: 21 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 100, height: 100, borderRadius: radius.md },
});
