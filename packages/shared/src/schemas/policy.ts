import { z } from 'zod';
import { policyStatusSchema, policyTypeSchema } from './enums';

export const policySchema = z.object({
  id: z.uuid(),
  type: policyTypeSchema,
  number: z.string(),
  status: policyStatusSchema,
  description: z.string(),
  coverAmountCents: z.number().int(),
  startDate: z.iso.date(),
});
export type Policy = z.infer<typeof policySchema>;

export const policyListResponseSchema = z.object({
  items: z.array(policySchema),
});
export type PolicyListResponse = z.infer<typeof policyListResponseSchema>;
