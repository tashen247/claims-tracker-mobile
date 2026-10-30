import { ApiError, createApiClient } from '../src/api/client';

function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as Response;
}

describe('api client', () => {
  it('sends the bearer token and Idempotency-Key header', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(201, { id: 'c1' }));
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetchImpl,
      tokens: { getAccessToken: () => 'access-1', refresh: jest.fn(), onSessionExpired: jest.fn() },
    });

    await client.createClaim(
      {
        policyId: 'p',
        type: 'mechanical_breakdown',
        incidentDate: '2026-10-20',
        description: 'x'.repeat(12),
        amountCents: 100,
      },
      'key-123',
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://api.test/v1/claims');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer access-1',
      'Idempotency-Key': 'key-123',
      'content-type': 'application/json',
    });
  });

  it('refreshes once on 401 and retries the request', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }),
      )
      .mockResolvedValue(jsonResponse(200, { items: [] }));
    const refresh = jest.fn().mockResolvedValue('access-2');
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetchImpl,
      tokens: { getAccessToken: () => 'access-1', refresh, onSessionExpired: jest.fn() },
    });

    await Promise.all([client.listPolicies(), client.listClaims({ status: 'paid', limit: 5 })]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[3][0]).toBe('http://api.test/v1/claims?status=paid&limit=5');
    expect(fetchImpl.mock.calls[2][1].headers.authorization).toBe('Bearer access-2');
  });

  it('reports an expired session when refresh fails', async () => {
    const onSessionExpired = jest.fn();
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetchImpl: jest.fn().mockResolvedValue(jsonResponse(401)),
      tokens: {
        getAccessToken: () => null,
        refresh: jest.fn().mockResolvedValue(null),
        onSessionExpired,
      },
    });
    await expect(client.me()).rejects.toMatchObject({ status: 401 });
    expect(onSessionExpired).toHaveBeenCalled();
  });

  it('maps API errors and network failures', async () => {
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetchImpl: jest
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(409, { error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'Key reused' } }),
        )
        .mockRejectedValueOnce(new TypeError('Network request failed')),
      tokens: { getAccessToken: () => 'a', refresh: jest.fn(), onSessionExpired: jest.fn() },
    });

    const conflict = await client.getClaim('c1').catch((e: ApiError) => e);
    expect(conflict).toBeInstanceOf(ApiError);
    expect(conflict).toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
      retryable: false,
    });

    const network = await client.getClaim('c1').catch((e: ApiError) => e);
    expect(network).toMatchObject({ status: 0, code: 'NETWORK_ERROR', retryable: true });
  });

  it('uploads a local file to a pre-signed URL', async () => {
    const blob = { size: 3 };
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ blob: async () => blob })
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ blob: async () => blob })
      .mockResolvedValueOnce({ ok: false, status: 403 });
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetchImpl,
      tokens: { getAccessToken: () => 'a', refresh: jest.fn(), onSessionExpired: jest.fn() },
    });

    await client.uploadToSignedUrl(
      'https://s3.test/put',
      { 'Content-Type': 'image/jpeg' },
      'file:///a.jpg',
    );
    expect(fetchImpl.mock.calls[1]).toEqual([
      'https://s3.test/put',
      { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob },
    ]);
    await expect(
      client.uploadToSignedUrl('https://s3.test/put', {}, 'file:///a.jpg'),
    ).rejects.toMatchObject({ code: 'UPLOAD_FAILED', status: 403 });
  });
});
