import { z } from 'zod';
import { roleSchema } from './enums';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }));

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(32).max(256),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  fullName: z.string(),
  role: roleSchema,
});
export type User = z.infer<typeof userSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().describe('Access token lifetime in seconds'),
  user: userSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const registerPushTokenRequestSchema = z.object({
  token: z
    .string()
    .regex(/^(ExponentPushToken|ExpoPushToken)\[.+\]$/, 'Not an Expo push token')
    .max(200),
  platform: z.enum(['ios', 'android', 'web']),
});
export type RegisterPushTokenRequest = z.infer<typeof registerPushTokenRequestSchema>;
