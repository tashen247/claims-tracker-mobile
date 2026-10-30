import { describe, expect, it } from 'vitest';
import {
  CLAIM_STATUSES,
  CLAIM_STATUS_LABELS,
  CLAIM_TYPES_BY_POLICY,
  canTransition,
  formatZar,
  isTerminalStatus,
  parseZarToCents,
} from '../src';

describe('claim status transitions', () => {
  it('allows the happy path through to paid', () => {
    expect(canTransition('submitted', 'in_review')).toBe(true);
    expect(canTransition('in_review', 'approved')).toBe(true);
    expect(canTransition('approved', 'paid')).toBe(true);
  });

  it('blocks skipping review and leaving terminal states', () => {
    expect(canTransition('submitted', 'approved')).toBe(false);
    expect(canTransition('paid', 'in_review')).toBe(false);
    expect(canTransition('rejected', 'approved')).toBe(false);
  });

  it('flags terminal states', () => {
    expect(isTerminalStatus('paid')).toBe(true);
    expect(isTerminalStatus('rejected')).toBe(true);
    expect(isTerminalStatus('in_review')).toBe(false);
  });

  it('has a label for every status', () => {
    for (const status of CLAIM_STATUSES) {
      expect(CLAIM_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe('claim types by policy', () => {
  it('maps every policy type to at least one claim type', () => {
    for (const types of Object.values(CLAIM_TYPES_BY_POLICY)) {
      expect(types.length).toBeGreaterThan(0);
    }
  });
});

describe('ZAR formatting and parsing', () => {
  it('formats cents as rand', () => {
    const formatted = formatZar(1_234_550);
    expect(formatted).toMatch(/^R/);
    expect(formatted.replace(/\s| /g, '')).toBe('R12345,50');
  });

  it.each([
    ['12345.50', 1_234_550],
    ['12 345,50', 1_234_550],
    ['R1,500', 150_000],
    ['R 1 500.5', 150_050],
    ['250', 25_000],
  ])('parses %s', (input, expected) => {
    expect(parseZarToCents(input)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '0', '1.2.3', '12,34,5'])('rejects %s', (input) => {
    expect(parseZarToCents(input)).toBeNull();
  });
});
