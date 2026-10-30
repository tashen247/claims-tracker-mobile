import { describe, expect, it } from 'vitest';
import {
  createClaimRequestSchema,
  idempotencyKeySchema,
  listClaimsQuerySchema,
  loginRequestSchema,
  registerPushTokenRequestSchema,
  registerRequestSchema,
  updateClaimStatusRequestSchema,
} from '../src';

const validClaim = {
  policyId: '6f1c1f9e-8a3b-4c2d-9e1f-0a1b2c3d4e5f',
  type: 'mechanical_breakdown',
  incidentDate: '2026-01-15',
  description: 'Gearbox failed on the N2 near Plettenberg Bay.',
  amountCents: 1_850_000,
} as const;

describe('registerRequestSchema', () => {
  it('normalises email casing and whitespace', () => {
    const parsed = registerRequestSchema.parse({
      email: '  Thandi@Example.CO.ZA ',
      password: 'Password123',
      fullName: 'Thandi Nkosi',
    });
    expect(parsed.email).toBe('thandi@example.co.za');
  });

  it('rejects weak passwords', () => {
    const result = registerRequestSchema.safeParse({
      email: 'a@b.co.za',
      password: 'password',
      fullName: 'Test User',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid emails', () => {
    expect(loginRequestSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
  });
});

describe('createClaimRequestSchema', () => {
  it('accepts a valid claim', () => {
    expect(createClaimRequestSchema.parse(validClaim)).toMatchObject(validClaim);
  });

  it('rejects incident dates in the future', () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const result = createClaimRequestSchema.safeParse({ ...validClaim, incidentDate: future });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer and non-positive amounts', () => {
    expect(createClaimRequestSchema.safeParse({ ...validClaim, amountCents: 10.5 }).success).toBe(
      false,
    );
    expect(createClaimRequestSchema.safeParse({ ...validClaim, amountCents: 0 }).success).toBe(
      false,
    );
  });

  it('requires a meaningful description', () => {
    expect(
      createClaimRequestSchema.safeParse({ ...validClaim, description: 'short' }).success,
    ).toBe(false);
  });
});

describe('idempotencyKeySchema', () => {
  it('accepts UUIDs', () => {
    expect(idempotencyKeySchema.safeParse('3b241101-e2bb-4255-8caf-4136c566a962').success).toBe(
      true,
    );
  });
  it('rejects short or unsafe keys', () => {
    expect(idempotencyKeySchema.safeParse('abc').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('abc def ghi').success).toBe(false);
  });
});

describe('listClaimsQuerySchema', () => {
  it('coerces and defaults the limit', () => {
    expect(listClaimsQuerySchema.parse({}).limit).toBe(20);
    expect(listClaimsQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    expect(listClaimsQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
});

describe('updateClaimStatusRequestSchema', () => {
  it('requires a note', () => {
    expect(updateClaimStatusRequestSchema.safeParse({ status: 'approved', note: '' }).success).toBe(
      false,
    );
    expect(
      updateClaimStatusRequestSchema.safeParse({ status: 'approved', note: 'Quote verified' })
        .success,
    ).toBe(true);
  });
});

describe('registerPushTokenRequestSchema', () => {
  it('accepts Expo push tokens only', () => {
    expect(
      registerPushTokenRequestSchema.safeParse({
        token: 'ExponentPushToken[abc123]',
        platform: 'ios',
      }).success,
    ).toBe(true);
    expect(
      registerPushTokenRequestSchema.safeParse({ token: 'fcm-token', platform: 'android' }).success,
    ).toBe(false);
  });
});
