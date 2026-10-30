import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config';
import { starterPolicies, policyNumber } from '../../src/services/demo-policies';
import { ExpoNotifier, NoopNotifier, buildStatusMessage } from '../../src/services/notifier';
import { S3PhotoStorage, photoKey } from '../../src/services/storage';

describe('config', () => {
  it('applies defaults', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3000);
    expect(config.S3_FORCE_PATH_STYLE).toBe(false);
    expect(config.PUSH_ENABLED).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('builds DATABASE_URL from separate ECS secrets', () => {
    const config = loadConfig({
      DB_HOST: 'db.internal',
      DB_USER: 'claims',
      DB_PASSWORD: 'p@ss/word',
      DB_NAME: 'claims',
    });
    expect(config.DATABASE_URL).toBe('postgres://claims:p%40ss%2Fword@db.internal:5432/claims');
    expect(
      loadConfig({ DATABASE_URL: 'postgres://a:b@c:5432/d', DB_HOST: 'ignored' }).DATABASE_URL,
    ).toBe('postgres://a:b@c:5432/d');
  });

  it('refuses the development JWT secret in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });
});

describe('demo policies', () => {
  it('creates one policy of each type', () => {
    expect(starterPolicies().map((p) => p.type)).toEqual(['motor_warranty', 'funeral', 'legal']);
    expect(policyNumber('funeral', 42)).toBe('FN-000042');
  });
});

describe('storage', () => {
  it('builds per-claim keys with the right extension', () => {
    expect(photoKey('abc', 'image/jpeg')).toMatch(/^claims\/abc\/[0-9a-f-]{36}\.jpg$/);
  });

  it('presigns upload and download URLs against the public endpoint', async () => {
    const storage = new S3PhotoStorage(
      loadConfig({
        S3_ENDPOINT: 'http://localstack:4566',
        S3_PUBLIC_ENDPOINT: 'http://192.168.1.10:4566',
        S3_FORCE_PATH_STYLE: 'true',
        S3_BUCKET: 'bucket',
      }),
    );
    const upload = await storage.presignUpload('claims/x/y.jpg', 'image/jpeg');
    expect(upload.url).toMatch(/^http:\/\/192\.168\.1\.10:4566\/bucket\/claims\/x\/y\.jpg\?/);
    expect(upload.url).toContain('X-Amz-Signature');
    expect(upload.headers['Content-Type']).toBe('image/jpeg');
    // A checksum baked into the URL would make S3 reject any non-empty upload.
    expect(upload.url).not.toMatch(/x-amz-checksum|x-amz-sdk-checksum/i);
    expect(await storage.presignDownload('claims/x/y.jpg')).toContain('X-Amz-Expires=900');
  });
});

describe('notifier', () => {
  const log = { warn: vi.fn(), error: vi.fn() } as never;

  it('builds a deep-linking message', () => {
    const message = buildStatusMessage({
      tokens: [],
      claimId: 'c1',
      reference: 'CLM-001001',
      status: 'approved',
    });
    expect(message.title).toBe('Claim CLM-001001 updated');
    expect(message.body).toBe('Your claim is now Approved.');
    expect(message.data).toMatchObject({ claimId: 'c1', url: 'claimstracker://claims/c1' });
  });

  it('skips invalid tokens without calling Expo', async () => {
    const notifier = new ExpoNotifier(log);
    const result = await notifier.claimStatusChanged({
      tokens: ['not-a-token'],
      claimId: 'c1',
      reference: 'CLM-001001',
      status: 'paid',
    });
    expect(result.invalidTokens).toEqual(['not-a-token']);
  });

  it('reports DeviceNotRegistered tokens as invalid and survives send failures', async () => {
    const notifier = new ExpoNotifier(log);
    const expo = (notifier as unknown as { expo: { sendPushNotificationsAsync: unknown } }).expo;
    expo.sendPushNotificationsAsync = vi
      .fn()
      .mockResolvedValueOnce([
        { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } },
      ]);
    const result = await notifier.claimStatusChanged({
      tokens: ['ExponentPushToken[abc]'],
      claimId: 'c1',
      reference: 'CLM-001001',
      status: 'paid',
    });
    expect(result.invalidTokens).toEqual(['ExponentPushToken[abc]']);

    expo.sendPushNotificationsAsync = vi.fn().mockRejectedValueOnce(new Error('network'));
    await expect(
      notifier.claimStatusChanged({
        tokens: ['ExponentPushToken[abc]'],
        claimId: 'c1',
        reference: 'r',
        status: 'paid',
      }),
    ).resolves.toEqual({ invalidTokens: [] });
  });

  it('noop notifier does nothing', async () => {
    await expect(new NoopNotifier().claimStatusChanged()).resolves.toEqual({ invalidTokens: [] });
  });
});
