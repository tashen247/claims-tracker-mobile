import type { ClaimType, PolicyType } from './schemas/enums';

const zarFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
});

/** Formats an integer amount in cents as South African rand, e.g. 1234550 -> "R 12 345,50". */
export function formatZar(amountCents: number): string {
  return zarFormatter.format(amountCents / 100);
}

/**
 * Parses a user-entered rand amount ("12 345,50", "12345.50", "R1,500") into integer cents.
 * Returns null when the input is not a valid positive amount with at most two decimals.
 */
export function parseZarToCents(input: string): number | null {
  const cleaned = input.replace(/[R\s ]/gi, '');
  if (cleaned === '') return null;

  // Treat the last "," or "." followed by 1-2 digits as the decimal separator.
  const match = /^(\d{1,3}(?:[,.]?\d{3})*|\d+)(?:[,.](\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;

  const whole = (match[1] ?? '').replace(/[,.]/g, '');
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const cents = Number(whole) * 100 + Number(fraction || '0');
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  motor_warranty: 'Motor Warranty',
  funeral: 'Funeral Cover',
  legal: 'Legal Plan',
};

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  mechanical_breakdown: 'Mechanical breakdown',
  electrical_fault: 'Electrical fault',
  death_of_member: 'Death of main member',
  death_of_dependant: 'Death of dependant',
  legal_consultation: 'Legal consultation',
  legal_representation: 'Legal representation',
};
