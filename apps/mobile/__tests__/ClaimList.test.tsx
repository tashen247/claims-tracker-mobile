import { fireEvent, render, screen } from '@testing-library/react-native';
import { ClaimList } from '../src/features/claims/ClaimList';
import type { QueuedClaim } from '../src/offline/types';
import { makeClaim, policies } from './fixtures';

const draft: QueuedClaim = {
  localId: 'draft-1',
  idempotencyKey: 'key-1',
  payload: {
    policyId: policies[0]!.id,
    type: 'electrical_fault',
    incidentDate: '2026-10-25',
    description: 'Central locking failed after a power surge.',
    amountCents: 420_000,
  },
  photos: [],
  policyLabel: 'Motor Warranty MW-100137',
  state: 'pending',
  attempts: 0,
  nextAttemptAt: 0,
  needsAttention: false,
  createdAt: '2026-10-25T10:00:00.000Z',
};

describe('ClaimList', () => {
  it('renders claims with status chips and opens a claim', async () => {
    const onPress = jest.fn();
    const claims = [
      makeClaim(),
      makeClaim({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        reference: 'CLM-001002',
        status: 'more_info_needed',
      }),
      makeClaim({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        reference: 'CLM-001003',
        status: 'paid',
      }),
    ];
    await render(<ClaimList claims={claims} onPressClaim={onPress} />);

    expect(screen.getByText('CLM-001001')).toBeTruthy();
    expect(screen.getByLabelText('Status: Submitted')).toBeTruthy();
    expect(screen.getByLabelText('Status: More Info Needed')).toBeTruthy();
    expect(screen.getByLabelText('Status: Paid')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: /Claim CLM-001002/ }));
    expect(onPress).toHaveBeenCalledWith(claims[1]);
  });

  it('shows an empty state', async () => {
    await render(<ClaimList claims={[]} onPressClaim={jest.fn()} />);
    expect(screen.getByText('No claims yet')).toBeTruthy();
  });

  it('shows loading and error states', async () => {
    const onRefresh = jest.fn();
    const { rerender } = await render(<ClaimList claims={[]} loading onPressClaim={jest.fn()} />);
    expect(screen.getByLabelText('Loading claims')).toBeTruthy();

    await rerender(
      <ClaimList claims={[]} error="Network down" onRefresh={onRefresh} onPressClaim={jest.fn()} />,
    );
    expect(screen.getByText('Network down')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('lists queued drafts above synced claims', async () => {
    await render(<ClaimList claims={[makeClaim()]} drafts={[draft]} onPressClaim={jest.fn()} />);
    expect(screen.getByTestId('draft-draft-1')).toBeTruthy();
    expect(screen.getByLabelText('Sync: Waiting to send')).toBeTruthy();
    expect(screen.getByText(/New claim · Electrical fault/)).toBeTruthy();
  });

  it('offers retry and discard for drafts the server rejected', async () => {
    const onRetry = jest.fn();
    const onDiscard = jest.fn();
    const rejected = {
      ...draft,
      state: 'failed' as const,
      needsAttention: true,
      lastError: 'Policy is not active',
    };
    await render(
      <ClaimList
        claims={[]}
        drafts={[rejected]}
        onPressClaim={jest.fn()}
        onRetryDraft={onRetry}
        onDiscardDraft={onDiscard}
      />,
    );
    expect(screen.getByLabelText('Sync: Needs attention')).toBeTruthy();
    expect(screen.getByText('Policy is not active')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    expect(onRetry).toHaveBeenCalledWith(rejected);
    expect(onDiscard).toHaveBeenCalledWith(rejected);
  });
});
