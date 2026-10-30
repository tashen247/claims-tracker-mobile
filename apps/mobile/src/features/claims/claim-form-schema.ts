import { z } from 'zod';
import {
  CLAIM_TYPES_BY_POLICY,
  MAX_PHOTOS_PER_CLAIM,
  MIN_PHOTOS_PER_CLAIM,
  createClaimRequestSchema,
  parseZarToCents,
  photoContentTypeSchema,
  type CreateClaimRequest,
  type Policy,
} from '@claims/shared';

/**
 * The form reuses the API's own field schemas from @claims/shared, adding only the
 * UI-specific parts: amount typed as rand text and the local photo list.
 */
export const claimFormSchema = createClaimRequestSchema
  .pick({ policyId: true, type: true, incidentDate: true, description: true })
  .extend({
    amount: z
      .string()
      .min(1, 'Enter the amount you are claiming')
      .refine(
        (value) => parseZarToCents(value) !== null,
        'Enter a valid rand amount, e.g. 12 500.00',
      ),
    photos: z
      .array(z.object({ uri: z.string(), contentType: photoContentTypeSchema }))
      .min(MIN_PHOTOS_PER_CLAIM, 'Add at least one photo')
      .max(MAX_PHOTOS_PER_CLAIM, `You can add up to ${MAX_PHOTOS_PER_CLAIM} photos`),
  });

export type ClaimFormValues = z.infer<typeof claimFormSchema>;

/** Cross-field rule needing the user's policies (claim type must be covered). */
export function validateAgainstPolicies(
  values: ClaimFormValues,
  policies: Policy[],
): string | null {
  const policy = policies.find((p) => p.id === values.policyId);
  if (!policy) return 'Choose a policy';
  if (!CLAIM_TYPES_BY_POLICY[policy.type].includes(values.type)) {
    return 'That claim type is not covered by the selected policy';
  }
  return null;
}

export function toCreateClaimRequest(values: ClaimFormValues): CreateClaimRequest {
  return createClaimRequestSchema.parse({
    policyId: values.policyId,
    type: values.type,
    incidentDate: values.incidentDate,
    description: values.description,
    amountCents: parseZarToCents(values.amount),
  });
}
