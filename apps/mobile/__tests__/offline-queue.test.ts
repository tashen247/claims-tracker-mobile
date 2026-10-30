import { ApiError } from '../src/api/client';
import { useClaimQueue } from '../src/offline/queue-store';
import { backoffDelay, processQueue, type QueueAccess, type SyncApi } from '../src/offline/sync';
import { makeClaim, policies } from './fixtures';

const payload = {
  policyId: policies[0]!.id,
  type: 'mechanical_breakdown' as const,
  incidentDate: '2026-10-20',
  description: 'Gearbox failed on the N1 near Midrand.',
  amountCents: 1_850_000,
};

function queue(): QueueAccess {
  const state = useClaimQueue.getState();
  return {
    items: () => useClaimQueue.getState().items,
    update: state.update,
    remove: state.remove,
  };
}

function fakeApi(overrides: Partial<SyncApi> = {}): jest.Mocked<SyncApi> {
  return {
    createClaim: jest
      .fn()
      .mockResolvedValue(makeClaim({ id: 'server-claim-1', reference: 'CLM-009999' })),
    requestPhotoUploadUrl: jest.fn().mockImplementation(async () => ({
      photoId: 'p',
      uploadUrl: 'https://s3.test/upload',
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      expiresIn: 600,
    })),
    uploadToSignedUrl: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<SyncApi>;
}

function enqueue(photoCount = 2) {
  return useClaimQueue.getState().enqueue({
    payload,
    policyLabel: 'Motor Warranty MW-100137',
    photos: Array.from({ length: photoCount }, (_, i) => ({
      localUri: `file:///drafts/${i}.jpg`,
      contentType: 'image/jpeg' as const,
    })),
  });
}

beforeEach(() => {
  useClaimQueue.setState({ items: [] });
});

describe('offline claim queue', () => {
  it('stores a draft with a stable idempotency key', () => {
    const item = enqueue();
    expect(item.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(useClaimQueue.getState().items).toHaveLength(1);
    expect(item.photos.every((p) => !p.uploaded)).toBe(true);
  });

  it('syncs a draft: creates the claim, uploads photos, then removes it', async () => {
    const item = enqueue(2);
    const api = fakeApi();

    const result = await processQueue(queue(), api);

    expect(result.synced).toEqual([item.localId]);
    expect(api.createClaim).toHaveBeenCalledWith(payload, item.idempotencyKey);
    expect(api.requestPhotoUploadUrl).toHaveBeenCalledTimes(2);
    expect(api.requestPhotoUploadUrl).toHaveBeenCalledWith('server-claim-1', 'image/jpeg');
    expect(api.uploadToSignedUrl).toHaveBeenCalledWith(
      'https://s3.test/upload',
      { 'Content-Type': 'image/jpeg' },
      'file:///drafts/0.jpg',
    );
    expect(useClaimQueue.getState().items).toHaveLength(0);
  });

  it('keeps the draft offline and retries with the same idempotency key', async () => {
    const item = enqueue(1);
    let now = 1_000_000;
    const offline = fakeApi({
      createClaim: jest
        .fn()
        .mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server')),
    });

    const first = await processQueue(queue(), offline, () => now);
    expect(first.failed).toEqual([item.localId]);
    const stored = useClaimQueue.getState().items[0]!;
    expect(stored).toMatchObject({ state: 'failed', attempts: 1, needsAttention: false });
    expect(stored.nextAttemptAt).toBeGreaterThan(now);

    // Not due yet: skipped.
    expect((await processQueue(queue(), offline, () => now)).skipped).toEqual([item.localId]);

    now = stored.nextAttemptAt + 1;
    const online = fakeApi();
    expect((await processQueue(queue(), online, () => now)).synced).toEqual([item.localId]);
    expect(online.createClaim).toHaveBeenCalledWith(payload, item.idempotencyKey);
  });

  it('resumes photo uploads without re-creating the claim', async () => {
    const item = enqueue(3);
    const api = fakeApi({
      uploadToSignedUrl: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Photo upload failed')),
    });

    await processQueue(queue(), api, () => 0);
    const partial = useClaimQueue.getState().items[0]!;
    expect(partial.serverClaimId).toBe('server-claim-1');
    expect(partial.serverReference).toBe('CLM-009999');
    expect(partial.photos.map((p) => p.uploaded)).toEqual([true, false, false]);

    const resume = fakeApi();
    await processQueue(queue(), resume, () => partial.nextAttemptAt + 1);
    expect(resume.createClaim).not.toHaveBeenCalled();
    expect(resume.uploadToSignedUrl).toHaveBeenCalledTimes(2);
    expect(useClaimQueue.getState().items.find((i) => i.localId === item.localId)).toBeUndefined();
  });

  it('flags drafts the server rejects and stops retrying them automatically', async () => {
    const item = enqueue(0);
    const api = fakeApi({
      createClaim: jest
        .fn()
        .mockRejectedValue(new ApiError(422, 'POLICY_NOT_ACTIVE', 'Policy is not active')),
    });

    await processQueue(queue(), api, () => 0);
    expect(useClaimQueue.getState().items[0]).toMatchObject({
      needsAttention: true,
      lastError: 'Policy is not active',
    });

    await processQueue(queue(), api, () => Number.MAX_SAFE_INTEGER);
    expect(api.createClaim).toHaveBeenCalledTimes(1);

    useClaimQueue.getState().retryNow(item.localId);
    expect(useClaimQueue.getState().items[0]).toMatchObject({
      needsAttention: false,
      state: 'pending',
    });
  });

  it('stops processing the rest of the queue when the device is offline', async () => {
    enqueue(0);
    enqueue(0);
    const api = fakeApi({
      createClaim: jest.fn().mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline')),
    });
    const result = await processQueue(queue(), api, () => 0);
    expect(api.createClaim).toHaveBeenCalledTimes(1);
    expect(result.failed).toHaveLength(1);
  });

  it('backs off exponentially with a cap', () => {
    const noJitter = () => 1;
    expect(backoffDelay(1, noJitter)).toBe(5_000);
    expect(backoffDelay(2, noJitter)).toBe(10_000);
    expect(backoffDelay(3, noJitter)).toBe(20_000);
    expect(backoffDelay(30, noJitter)).toBe(600_000);
    expect(backoffDelay(1, () => 0)).toBe(2_500);
  });
});
