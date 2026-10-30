import { z } from 'zod';

export const ROLES = ['policyholder', 'assessor'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const POLICY_TYPES = ['motor_warranty', 'funeral', 'legal'] as const;
export const policyTypeSchema = z.enum(POLICY_TYPES);
export type PolicyType = z.infer<typeof policyTypeSchema>;

export const POLICY_STATUSES = ['active', 'lapsed', 'cancelled'] as const;
export const policyStatusSchema = z.enum(POLICY_STATUSES);
export type PolicyStatus = z.infer<typeof policyStatusSchema>;

export const CLAIM_TYPES = [
  'mechanical_breakdown',
  'electrical_fault',
  'death_of_member',
  'death_of_dependant',
  'legal_consultation',
  'legal_representation',
] as const;
export const claimTypeSchema = z.enum(CLAIM_TYPES);
export type ClaimType = z.infer<typeof claimTypeSchema>;

/** Which claim types may be lodged against each kind of policy. */
export const CLAIM_TYPES_BY_POLICY: Record<PolicyType, readonly ClaimType[]> = {
  motor_warranty: ['mechanical_breakdown', 'electrical_fault'],
  funeral: ['death_of_member', 'death_of_dependant'],
  legal: ['legal_consultation', 'legal_representation'],
};

export const CLAIM_STATUSES = [
  'submitted',
  'in_review',
  'more_info_needed',
  'approved',
  'rejected',
  'paid',
] as const;
export const claimStatusSchema = z.enum(CLAIM_STATUSES);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/heic'] as const;
export const photoContentTypeSchema = z.enum(PHOTO_CONTENT_TYPES);
export type PhotoContentType = z.infer<typeof photoContentTypeSchema>;
