import type { Claim, Policy } from '@claims/shared';

export const policies: Policy[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'motor_warranty',
    number: 'MW-100137',
    status: 'active',
    description: 'Mechanical warranty: 2021 Toyota Corolla Cross 1.8 XS',
    coverAmountCents: 15_000_000,
    startDate: '2024-01-01',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    type: 'funeral',
    number: 'FN-100274',
    status: 'active',
    description: 'Family funeral cover',
    coverAmountCents: 3_000_000,
    startDate: '2024-01-01',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    type: 'legal',
    number: 'LG-100411',
    status: 'lapsed',
    description: 'Legal plan',
    coverAmountCents: 7_500_000,
    startDate: '2024-01-01',
  },
];

export function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    reference: 'CLM-001001',
    policyId: policies[0]!.id,
    userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    type: 'mechanical_breakdown',
    incidentDate: '2026-10-20',
    description: 'Gearbox failed on the N1 near Midrand.',
    amountCents: 1_850_000,
    status: 'submitted',
    photoCount: 2,
    createdAt: '2026-10-21T08:00:00.000Z',
    updatedAt: '2026-10-21T08:00:00.000Z',
    ...overrides,
  };
}
