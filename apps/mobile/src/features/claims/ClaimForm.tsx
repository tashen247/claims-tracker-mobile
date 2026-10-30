import { zodResolver } from '@hookform/resolvers/zod';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CLAIM_TYPES_BY_POLICY,
  CLAIM_TYPE_LABELS,
  MAX_PHOTOS_PER_CLAIM,
  POLICY_TYPE_LABELS,
  type CreateClaimRequest,
  type Policy,
} from '@claims/shared';
import { Button, ChipSelect, TextField } from '../../components/ui';
import { daysAgo } from '../../lib/dates';
import { radius, spacing, useTheme } from '../../theme';
import {
  claimFormSchema,
  toCreateClaimRequest,
  validateAgainstPolicies,
  type ClaimFormValues,
} from './claim-form-schema';
import type { PickedPhoto, PhotoSource } from './pick-photo';

export interface ClaimFormSubmit {
  request: CreateClaimRequest;
  photos: PickedPhoto[];
  policy: Policy;
}

export interface ClaimFormProps {
  policies: Policy[];
  onSubmit: (data: ClaimFormSubmit) => Promise<void> | void;
  pickPhoto: (source: PhotoSource) => Promise<PickedPhoto | null>;
  submitting?: boolean;
}

export function ClaimForm({ policies, onSubmit, pickPhoto, submitting = false }: ClaimFormProps) {
  const { colors } = useTheme();
  const activePolicies = useMemo(() => policies.filter((p) => p.status === 'active'), [policies]);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ClaimFormValues>({
    resolver: zodResolver(claimFormSchema),
    defaultValues: {
      policyId: activePolicies.length === 1 ? activePolicies[0]!.id : undefined,
      incidentDate: daysAgo(0),
      description: '',
      amount: '',
      photos: [],
    },
  });

  const policyId = watch('policyId');
  const photos = watch('photos');
  const selectedPolicy = activePolicies.find((p) => p.id === policyId);
  const claimTypes = selectedPolicy ? CLAIM_TYPES_BY_POLICY[selectedPolicy.type] : [];

  async function addPhoto(source: PhotoSource) {
    const photo = await pickPhoto(source);
    if (photo) setValue('photos', [...photos, photo], { shouldValidate: true });
  }

  const submit = handleSubmit(async (values) => {
    const problem = validateAgainstPolicies(values, activePolicies);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    await onSubmit({
      request: toCreateClaimRequest(values),
      photos: values.photos,
      policy: activePolicies.find((p) => p.id === values.policyId)!,
    });
  });

  return (
    <View>
      <Controller
        control={control}
        name="policyId"
        render={({ field }) => (
          <ChipSelect
            label="Policy"
            value={field.value}
            onChange={(value) => {
              field.onChange(value);
              setValue('type', undefined as never);
            }}
            options={activePolicies.map((p) => ({
              value: p.id,
              label: `${POLICY_TYPE_LABELS[p.type]} · ${p.number}`,
            }))}
            error={errors.policyId?.message}
          />
        )}
      />

      {selectedPolicy ? (
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <ChipSelect
              label="What happened?"
              value={field.value}
              onChange={field.onChange}
              options={claimTypes.map((t) => ({ value: t, label: CLAIM_TYPE_LABELS[t] }))}
              error={errors.type ? 'Choose a claim type' : undefined}
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="incidentDate"
        render={({ field }) => (
          <View>
            <TextField
              label="Incident date"
              hint="Format YYYY-MM-DD"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              error={errors.incidentDate?.message}
            />
            <View style={styles.quickDates}>
              <Button
                label="Today"
                variant="secondary"
                onPress={() => field.onChange(daysAgo(0))}
              />
              <Button
                label="Yesterday"
                variant="secondary"
                onPress={() => field.onChange(daysAgo(1))}
              />
            </View>
          </View>
        )}
      />

      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <TextField
            label="Description"
            placeholder="Where and how did it happen?"
            multiline
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            maxLength={2000}
            error={errors.description?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="amount"
        render={({ field }) => (
          <TextField
            label="Amount claimed (ZAR)"
            placeholder="e.g. 12 500.00"
            keyboardType="decimal-pad"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.amount?.message}
          />
        )}
      />

      <Text style={[styles.label, { color: colors.text }]}>
        Photos ({photos.length}/{MAX_PHOTOS_PER_CLAIM})
      </Text>
      <View style={styles.photos}>
        {photos.map((photo, index) => (
          <View key={`${photo.uri}-${index}`} style={styles.photoWrap}>
            <Image
              source={{ uri: photo.uri }}
              style={[styles.photo, { backgroundColor: colors.surfaceMuted }]}
              accessibilityLabel={`Photo ${index + 1}`}
              contentFit="cover"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${index + 1}`}
              onPress={() =>
                setValue(
                  'photos',
                  photos.filter((_, i) => i !== index),
                  { shouldValidate: true },
                )
              }
              style={[styles.remove, { backgroundColor: colors.danger }]}
            >
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {photos.length < MAX_PHOTOS_PER_CLAIM ? (
        <View style={styles.quickDates}>
          <Button label="Take photo" variant="secondary" onPress={() => void addPhoto('camera')} />
          <Button
            label="Choose from gallery"
            variant="secondary"
            onPress={() => void addPhoto('library')}
          />
        </View>
      ) : null}
      {errors.photos ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>
          {errors.photos.message}
        </Text>
      ) : null}

      {formError ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>
          {formError}
        </Text>
      ) : null}

      <Button
        label="Submit claim"
        onPress={() => void submit()}
        loading={submitting}
        style={styles.submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', marginBottom: spacing.sm },
  quickDates: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  photoWrap: { position: 'relative' },
  photo: { width: 84, height: 84, borderRadius: radius.md },
  remove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  error: { fontSize: 13, marginBottom: spacing.md },
  submit: { marginTop: spacing.lg },
});
