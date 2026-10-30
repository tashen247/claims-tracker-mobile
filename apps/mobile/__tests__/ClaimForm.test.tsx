import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ClaimForm } from '../src/features/claims/ClaimForm';
import { policies } from './fixtures';

const photo = { uri: 'file:///photos/gearbox.jpg', contentType: 'image/jpeg' as const };

async function fillValidForm(pickPhoto: jest.Mock) {
  await fireEvent.press(screen.getByRole('radio', { name: 'Motor Warranty · MW-100137' }));
  await fireEvent.press(await screen.findByRole('radio', { name: 'Mechanical breakdown' }));
  await fireEvent.changeText(screen.getByLabelText('Incident date'), '2026-10-20');
  await fireEvent.changeText(
    screen.getByLabelText('Description'),
    'Gearbox failed on the N1 near Midrand; towed to the dealer.',
  );
  await fireEvent.changeText(screen.getByLabelText('Amount claimed (ZAR)'), '18 500,00');
  pickPhoto.mockResolvedValueOnce(photo);
  await fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));
  await screen.findByLabelText('Photo 1');
}

describe('ClaimForm', () => {
  it('only offers active policies and the claim types they cover', async () => {
    await render(<ClaimForm policies={policies} onSubmit={jest.fn()} pickPhoto={jest.fn()} />);

    expect(screen.getByRole('radio', { name: 'Motor Warranty · MW-100137' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /Legal Plan/ })).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Funeral Cover · FN-100274' }));
    expect(await screen.findByRole('radio', { name: 'Death of main member' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Mechanical breakdown' })).toBeNull();
  });

  it('shows validation errors from the shared schema', async () => {
    const onSubmit = jest.fn();
    await render(<ClaimForm policies={policies} onSubmit={onSubmit} pickPhoto={jest.fn()} />);

    await fireEvent.changeText(screen.getByLabelText('Description'), 'short');
    await fireEvent.changeText(screen.getByLabelText('Amount claimed (ZAR)'), 'abc');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit claim' }));

    expect(await screen.findByText('Choose a policy')).toBeTruthy();
    expect(screen.getByText('Describe what happened (at least 10 characters)')).toBeTruthy();
    expect(screen.getByText('Enter a valid rand amount, e.g. 12 500.00')).toBeTruthy();
    expect(screen.getByText('Add at least one photo')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects incident dates in the future', async () => {
    await render(<ClaimForm policies={policies} onSubmit={jest.fn()} pickPhoto={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('Incident date'), '2999-01-01');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit claim' }));
    expect(await screen.findByText('Incident date cannot be in the future')).toBeTruthy();
  });

  it('submits a valid claim with the amount converted to cents', async () => {
    const onSubmit = jest.fn();
    const pickPhoto = jest.fn();
    await render(<ClaimForm policies={policies} onSubmit={onSubmit} pickPhoto={pickPhoto} />);

    await fillValidForm(pickPhoto);
    await fireEvent.press(screen.getByRole('button', { name: 'Submit claim' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(pickPhoto).toHaveBeenCalledWith('library');
    expect(onSubmit.mock.calls[0][0]).toEqual({
      request: {
        policyId: policies[0]!.id,
        type: 'mechanical_breakdown',
        incidentDate: '2026-10-20',
        description: 'Gearbox failed on the N1 near Midrand; towed to the dealer.',
        amountCents: 1_850_000,
      },
      photos: [photo],
      policy: policies[0],
    });
  });

  it('lets the user remove a photo and caps photos at five', async () => {
    const pickPhoto = jest.fn().mockResolvedValue(photo);
    await render(<ClaimForm policies={policies} onSubmit={jest.fn()} pickPhoto={pickPhoto} />);

    for (let i = 0; i < 5; i += 1) {
      await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
      await screen.findByLabelText(`Photo ${i + 1}`);
    }
    expect(screen.getByText('Photos (5/5)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Remove photo 5' }));
    expect(await screen.findByText('Photos (4/5)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeTruthy();
  });

  it('ignores a cancelled photo picker', async () => {
    const pickPhoto = jest.fn().mockResolvedValue(null);
    await render(<ClaimForm policies={policies} onSubmit={jest.fn()} pickPhoto={pickPhoto} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
    expect(screen.getByText('Photos (0/5)')).toBeTruthy();
  });
});
