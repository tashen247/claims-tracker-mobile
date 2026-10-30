import { describe, expect, it } from 'vitest';
import {
  generateRefreshToken,
  hashPassword,
  hashRequestBody,
  sha256,
  stableStringify,
  verifyPassword,
} from '../../src/lib/crypto';
import { decodeCursor, encodeCursor } from '../../src/lib/cursor';

describe('crypto helpers', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('Password123', 4);
    expect(await verifyPassword('Password123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('generates unique url-safe refresh tokens', () => {
    const a = generateRefreshToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(a).not.toBe(generateRefreshToken());
    expect(sha256(a)).toHaveLength(64);
  });

  it('hashes request bodies independently of key order', () => {
    expect(hashRequestBody({ a: 1, b: { c: [1, 2], d: 'x' } })).toBe(
      hashRequestBody({ b: { d: 'x', c: [1, 2] }, a: 1 }),
    );
    expect(hashRequestBody({ a: 1 })).not.toBe(hashRequestBody({ a: 2 }));
    expect(stableStringify({ a: undefined, b: null })).toBe('{"b":null}');
  });
});

describe('cursor', () => {
  it('round-trips', () => {
    const cursor = {
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      id: '6f1c1f9e-8a3b-4c2d-9e1f-0a1b2c3d4e5f',
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('rejects garbage', () => {
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor(Buffer.from('2026-01-01|nope').toString('base64url'))).toBeNull();
    expect(
      decodeCursor(
        Buffer.from('bad-date|6f1c1f9e-8a3b-4c2d-9e1f-0a1b2c3d4e5f').toString('base64url'),
      ),
    ).toBeNull();
  });
});
