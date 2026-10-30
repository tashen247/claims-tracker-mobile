import { z } from 'zod';

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    correlationId: z.string().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const idParamSchema = z.object({ id: z.uuid() });

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  checks: z.record(z.string(), z.enum(['ok', 'fail'])),
});
