import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());

describe('platform', () => {
  it('reports health', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', checks: { database: 'ok' } });
  });

  it('echoes or generates a correlation ID', async () => {
    const supplied = await ctx.app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-correlation-id': 'abc-123' },
    });
    expect(supplied.headers['x-correlation-id']).toBe('abc-123');

    const generated = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(generated.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('serves an OpenAPI document generated from the Zod schemas', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        '/v1/auth/login',
        '/v1/claims',
        '/v1/claims/{id}',
        '/v1/claims/{id}/photos/upload-url',
        '/v1/claims/{id}/status',
      ]),
    );
    const create = spec.paths['/v1/claims'].post;
    expect(create.parameters.some((p: { name: string }) => p.name === 'idempotency-key')).toBe(
      true,
    );
  });

  it('allows cross-origin PATCH with an Idempotency-Key header (preflight)', async () => {
    const res = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/v1/claims/6f1c1f9e-8a3b-4c2d-9e1f-0a1b2c3d4e5f/status',
      headers: {
        origin: 'http://localhost:8081',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'authorization,content-type,idempotency-key',
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
    expect(String(res.headers['access-control-allow-headers'])).toContain('idempotency-key');
  });

  it('returns JSON 404s for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
