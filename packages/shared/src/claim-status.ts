import type { ClaimStatus } from './schemas/enums';

/**
 * Allowed assessor transitions. Terminal states (rejected, paid) have no outgoing edges.
 * Kept in the shared package so the app only offers buttons the API will accept.
 */
export const CLAIM_STATUS_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  submitted: ['in_review', 'rejected'],
  in_review: ['more_info_needed', 'approved', 'rejected'],
  more_info_needed: ['in_review', 'rejected'],
  approved: ['paid'],
  rejected: [],
  paid: [],
};

export function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_STATUS_TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: ClaimStatus): boolean {
  return CLAIM_STATUS_TRANSITIONS[status].length === 0;
}

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  submitted: 'Submitted',
  in_review: 'In Review',
  more_info_needed: 'More Info Needed',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
};
