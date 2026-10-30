import { randomInt } from 'node:crypto';
import type { PolicyType } from '@claims/shared';

export interface NewPolicy {
  type: PolicyType;
  number: string;
  description: string;
  coverAmountCents: number;
  startDate: string;
}

const PREFIX: Record<PolicyType, string> = { motor_warranty: 'MW', funeral: 'FN', legal: 'LG' };

export function policyNumber(
  type: PolicyType,
  sequence: number = randomInt(100_000, 999_999),
): string {
  return `${PREFIX[type]}-${sequence.toString().padStart(6, '0')}`;
}

/**
 * New sign-ups get one policy of each type so the demo flow (register, then claim) works
 * without an insurer integration, which is out of scope.
 */
export function starterPolicies(today = new Date()): NewPolicy[] {
  const start = new Date(today.getTime() - 400 * 86_400_000).toISOString().slice(0, 10);
  return [
    {
      type: 'motor_warranty',
      number: policyNumber('motor_warranty'),
      description: 'Mechanical warranty: 2021 Toyota Corolla Cross 1.8 XS',
      coverAmountCents: 15_000_000,
      startDate: start,
    },
    {
      type: 'funeral',
      number: policyNumber('funeral'),
      description: 'Family funeral cover: main member, spouse and 3 children',
      coverAmountCents: 3_000_000,
      startDate: start,
    },
    {
      type: 'legal',
      number: policyNumber('legal'),
      description: 'Legal plan: labour, consumer and motor matters',
      coverAmountCents: 7_500_000,
      startDate: start,
    },
  ];
}
