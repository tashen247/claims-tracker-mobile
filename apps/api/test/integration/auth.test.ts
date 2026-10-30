import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bearer,
  createTestContext,
  registerUser,
  resetDatabase,
  type TestContext,
} from '../helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDatabase(ctx));

describe('POST /v1/auth/register', () => {
  it('creates a policyholder with starter policies and returns tokens', async () => {
    const auth = await registerUser(ctx, 'Thandi Nkosi');
    expect(auth.user.role).toBe('policyholder');
    expect(auth.accessToken).toBeTruthy();
    expect(auth.refreshToken).toBeTruthy();

    const policies = await ctx.app.inject({
      method: 'GET',
      url: '/v1/policies',
      headers: bearer(auth),
    });
    expect(policies.statusCode).toBe(200);
    expect(policies.json().items).toHaveLength(3);
  });

  it('rejects duplicate emails', async () => {
    const payload = { email: 'dup@example.co.za', password: 'Password123', fullName: 'Dup User' };
    expect(
      (await ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload })).statusCode,
    ).toBe(201);
    const again = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { ...payload, email: 'DUP@example.co.za' },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('EMAIL_TAKEN');
  });

  it('validates input with the shared schema', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'not-an-email', password: 'short', fullName: 'X' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.correlationId).toBeTruthy();
  });
});

describe('POST /v1/auth/login', () => {
  it('logs in with correct credentials and rejects wrong ones', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'sipho@example.co.za', password: 'Password123', fullName: 'Sipho Dlamini' },
    });
    const ok = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'Sipho@Example.co.za', password: 'Password123' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.fullName).toBe('Sipho Dlamini');

    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'sipho@example.co.za', password: 'Wrong12345' },
    });
    expect(bad.statusCode).toBe(401);

    const unknown = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'nobody@example.co.za', password: 'Password123' },
    });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error.message).toBe(bad.json().error.message);
  });
});

describe('POST /v1/auth/refresh', () => {
  it('rotates refresh tokens and detects reuse', async () => {
    const auth = await registerUser(ctx);
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: auth.refreshToken },
    });
    expect(first.statusCode).toBe(200);
    const rotated = first.json().refreshToken as string;
    expect(rotated).not.toBe(auth.refreshToken);

    // Replaying the old token revokes the whole token family, including the rotated one.
    const replay = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: auth.refreshToken },
    });
    expect(replay.statusCode).toBe(401);

    const afterReuse = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: rotated },
    });
    expect(afterReuse.statusCode).toBe(401);
  });

  it('rejects unknown tokens and supports logout', async () => {
    const auth = await registerUser(ctx);
    const unknown = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: 'x'.repeat(64) },
    });
    expect(unknown.statusCode).toBe(401);

    const logout = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: { refreshToken: auth.refreshToken },
    });
    expect(logout.statusCode).toBe(204);
    const afterLogout = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: auth.refreshToken },
    });
    expect(afterLogout.statusCode).toBe(401);
  });
});

describe('protected routes', () => {
  it('require a valid bearer token', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/policies' })).statusCode).toBe(401);
    const bad = await ctx.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer nope' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('returns the current user and manages push tokens', async () => {
    const auth = await registerUser(ctx, 'Lerato Mokoena');
    const me = await ctx.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(auth) });
    expect(me.json()).toMatchObject({ fullName: 'Lerato Mokoena', role: 'policyholder' });

    const token = 'ExponentPushToken[device-1]';
    const add = await ctx.app.inject({
      method: 'POST',
      url: '/v1/me/push-tokens',
      headers: bearer(auth),
      payload: { token, platform: 'android' },
    });
    expect(add.statusCode).toBe(204);
    // Registering the same token twice is an upsert.
    expect(
      (
        await ctx.app.inject({
          method: 'POST',
          url: '/v1/me/push-tokens',
          headers: bearer(auth),
          payload: { token, platform: 'android' },
        })
      ).statusCode,
    ).toBe(204);
    const remove = await ctx.app.inject({
      method: 'DELETE',
      url: '/v1/me/push-tokens',
      headers: bearer(auth),
      payload: { token },
    });
    expect(remove.statusCode).toBe(204);
  });
});

describe('rate limiting', () => {
  it('limits auth endpoints', async () => {
    const limited = await createTestContext({ AUTH_RATE_LIMIT_MAX: '3' });
    try {
      const attempt = () =>
        limited.app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          payload: { email: 'nobody@example.co.za', password: 'Password123' },
        });
      const codes = [];
      for (let i = 0; i < 4; i += 1) codes.push((await attempt()).statusCode);
      expect(codes).toEqual([401, 401, 401, 429]);
      const last = await attempt();
      expect(last.json().error.code).toBe('RATE_LIMITED');
      expect(last.headers['retry-after']).toBeDefined();
    } finally {
      await limited.close();
    }
  });
});
