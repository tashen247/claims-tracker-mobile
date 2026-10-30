import type {
  AuthResponse,
  Claim,
  ClaimDetail,
  ClaimListResponse,
  ClaimStatus,
  CreateClaimRequest,
  ErrorResponse,
  LoginRequest,
  PhotoContentType,
  PhotoUploadUrlResponse,
  PolicyListResponse,
  RegisterRequest,
  UpdateClaimStatusRequest,
  User,
} from '@claims/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Errors worth retrying later: offline, timeouts, rate limits, server faults. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export interface TokenProvider {
  getAccessToken(): string | null;
  /**
   * Exchanges the refresh token. Returns the new access token, or null when the session is gone.
   * Throws a retryable ApiError when the refresh could not be attempted (e.g. offline).
   */
  refresh(): Promise<string | null>;
  onSessionExpired(): void;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenProvider;
  fetchImpl?: typeof fetch;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
};

export function createApiClient({ baseUrl, tokens, fetchImpl = fetch }: ApiClientOptions) {
  let refreshing: Promise<string | null> | null = null;

  // Single-flight refresh so parallel 401s trigger only one rotation.
  function refreshOnce(): Promise<string | null> {
    refreshing ??= tokens.refresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function send(path: string, options: RequestOptions, accessToken: string | null) {
    const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.auth !== false && accessToken) headers.authorization = `Bearer ${accessToken}`;
    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server', error);
    }
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let response = await send(path, options, tokens.getAccessToken());

    if (response.status === 401 && options.auth !== false) {
      const fresh = await refreshOnce();
      if (!fresh) {
        tokens.onSessionExpired();
        throw new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please log in again.');
      }
      response = await send(path, options, fresh);
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      const error = (data as ErrorResponse | undefined)?.error;
      throw new ApiError(
        response.status,
        error?.code ?? 'HTTP_ERROR',
        error?.message ?? `Request failed (${response.status})`,
        error?.details,
      );
    }
    return data as T;
  }

  return {
    request,
    login: (body: LoginRequest) =>
      request<AuthResponse>('/v1/auth/login', { method: 'POST', body, auth: false }),
    register: (body: RegisterRequest) =>
      request<AuthResponse>('/v1/auth/register', { method: 'POST', body, auth: false }),
    refresh: (refreshToken: string) =>
      request<AuthResponse>('/v1/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        auth: false,
      }),
    logout: (refreshToken: string) =>
      request<void>('/v1/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
    me: () => request<User>('/v1/me'),
    registerPushToken: (token: string, platform: 'ios' | 'android' | 'web') =>
      request<void>('/v1/me/push-tokens', { method: 'POST', body: { token, platform } }),
    unregisterPushToken: (token: string) =>
      request<void>('/v1/me/push-tokens', { method: 'DELETE', body: { token } }),
    listPolicies: () => request<PolicyListResponse>('/v1/policies'),
    listClaims: (params: { status?: ClaimStatus; cursor?: string; limit?: number } = {}) => {
      const query = new URLSearchParams();
      if (params.status) query.set('status', params.status);
      if (params.cursor) query.set('cursor', params.cursor);
      if (params.limit) query.set('limit', String(params.limit));
      const qs = query.toString();
      return request<ClaimListResponse>(`/v1/claims${qs ? `?${qs}` : ''}`);
    },
    getClaim: (id: string) => request<ClaimDetail>(`/v1/claims/${id}`),
    createClaim: (body: CreateClaimRequest, idempotencyKey: string) =>
      request<Claim>('/v1/claims', {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    requestPhotoUploadUrl: (claimId: string, contentType: PhotoContentType) =>
      request<PhotoUploadUrlResponse>(`/v1/claims/${claimId}/photos/upload-url`, {
        method: 'POST',
        body: { contentType },
      }),
    updateClaimStatus: (id: string, body: UpdateClaimStatusRequest) =>
      request<Claim>(`/v1/claims/${id}/status`, { method: 'PATCH', body }),
    /** Uploads a local file straight to S3 using a pre-signed URL. */
    async uploadToSignedUrl(url: string, headers: Record<string, string>, localUri: string) {
      let blob: Blob;
      try {
        blob = await (await fetchImpl(localUri)).blob();
      } catch (error) {
        throw new ApiError(
          400,
          'PHOTO_UNREADABLE',
          'The photo could not be read from the device',
          error,
        );
      }
      let response: Response;
      try {
        response = await fetchImpl(url, { method: 'PUT', headers, body: blob });
      } catch (error) {
        throw new ApiError(0, 'NETWORK_ERROR', 'Photo upload failed', error);
      }
      if (!response.ok) {
        throw new ApiError(
          response.status,
          'UPLOAD_FAILED',
          `Photo upload failed (${response.status})`,
        );
      }
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
