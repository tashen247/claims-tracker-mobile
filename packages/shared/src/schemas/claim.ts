import { z } from 'zod';
import { claimStatusSchema, claimTypeSchema, photoContentTypeSchema } from './enums';

export const MAX_PHOTOS_PER_CLAIM = 5;
export const MIN_PHOTOS_PER_CLAIM = 1;
export const MAX_CLAIM_AMOUNT_CENTS = 500_000_000; // R5,000,000

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const incidentDateSchema = z.iso
  .date({ message: 'Enter a valid date (YYYY-MM-DD)' })
  .refine((value) => value <= todayIso(), 'Incident date cannot be in the future');

export const createClaimRequestSchema = z.object({
  policyId: z.uuid({ message: 'Choose a policy' }),
  type: claimTypeSchema,
  incidentDate: incidentDateSchema,
  description: z
    .string()
    .trim()
    .min(10, 'Describe what happened (at least 10 characters)')
    .max(2000, 'Description must be at most 2000 characters'),
  amountCents: z
    .number()
    .int('Amount must be in whole cents')
    .positive('Amount must be greater than zero')
    .max(MAX_CLAIM_AMOUNT_CENTS, 'Amount exceeds the maximum claim value'),
});
export type CreateClaimRequest = z.infer<typeof createClaimRequestSchema>;

export const idempotencyKeySchema = z
  .string()
  .min(8, 'Idempotency-Key must be at least 8 characters')
  .max(128, 'Idempotency-Key must be at most 128 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'Idempotency-Key may only contain letters, digits, - and _');

export const claimSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  policyId: z.uuid(),
  userId: z.uuid(),
  type: claimTypeSchema,
  incidentDate: z.iso.date(),
  description: z.string(),
  amountCents: z.number().int(),
  status: claimStatusSchema,
  photoCount: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Claim = z.infer<typeof claimSchema>;

export const claimPhotoSchema = z.object({
  id: z.uuid(),
  url: z.url().describe('Short-lived pre-signed download URL'),
  contentType: photoContentTypeSchema,
  createdAt: z.iso.datetime(),
});
export type ClaimPhoto = z.infer<typeof claimPhotoSchema>;

export const claimStatusEventSchema = z.object({
  id: z.uuid(),
  fromStatus: claimStatusSchema.nullable(),
  toStatus: claimStatusSchema,
  note: z.string().nullable(),
  actor: z.object({ id: z.uuid(), fullName: z.string(), role: z.string() }),
  createdAt: z.iso.datetime(),
});
export type ClaimStatusEvent = z.infer<typeof claimStatusEventSchema>;

export const claimDetailSchema = claimSchema.extend({
  policy: z.object({ id: z.uuid(), number: z.string(), type: z.string() }),
  claimant: z.object({ id: z.uuid(), fullName: z.string(), email: z.string() }),
  photos: z.array(claimPhotoSchema),
  events: z.array(claimStatusEventSchema),
});
export type ClaimDetail = z.infer<typeof claimDetailSchema>;

export const listClaimsQuerySchema = z.object({
  status: claimStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});
export type ListClaimsQuery = z.infer<typeof listClaimsQuerySchema>;

export const claimListResponseSchema = z.object({
  items: z.array(claimSchema),
  nextCursor: z.string().nullable(),
});
export type ClaimListResponse = z.infer<typeof claimListResponseSchema>;

export const updateClaimStatusRequestSchema = z.object({
  status: claimStatusSchema,
  note: z
    .string()
    .trim()
    .min(3, 'A note is required when changing status')
    .max(1000, 'Note must be at most 1000 characters'),
});
export type UpdateClaimStatusRequest = z.infer<typeof updateClaimStatusRequestSchema>;

export const photoUploadUrlRequestSchema = z.object({
  contentType: photoContentTypeSchema,
});
export type PhotoUploadUrlRequest = z.infer<typeof photoUploadUrlRequestSchema>;

export const photoUploadUrlResponseSchema = z.object({
  photoId: z.uuid(),
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresIn: z.number().int(),
});
export type PhotoUploadUrlResponse = z.infer<typeof photoUploadUrlResponseSchema>;
