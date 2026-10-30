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

/** Uploads a local file to a URL with PUT and returns the HTTP status. */
export type UploadFile = (
  url: string,
  localUri: string,
  headers: Record<string, string>,
) => Promise<number>;

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenProvider;
  fetchImpl?: typeof fetch;
  uploadFile?: UploadFile;
  /** Per-request timeout for API calls. */
  requestTimeoutMs?: number;
  /** Timeout for a single photo upload. */
  uploadTimeoutMs?: number;
}

/** Rejects with a retryable error if the promise doesn't settle in time, so a hung request
 * can never block the offline queue. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError(408, 'TIMEOUT', `${what} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
};

export function createApiClient({
  baseUrl,
  tokens,
  fetchImpl = fetch,
  uploadFile,
  requestTimeoutMs = 20_000,
  uploadTimeoutMs = 120_000,
}: ApiClientOptions) {
  const fetchUpload: UploadFile = async (url, localUri, headers) => {
    const blob = await (await fetchImpl(localUri)).blob();
    const response = await fetchImpl(url, { method: 'PUT', headers, body: blob });
    return response.status;
  };
  const doUpload = uploadFile ?? fetchUpload;

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
      return await withTimeout(
        fetchImpl(`${baseUrl}${path}`, {
          method: options.method ?? 'GET',
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        }),
        requestTimeoutMs,
        'Request',
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
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
    listClaims: (params: { status?: ClaimStatus; pageToken?: string; limit?: number } = {}) => {
      const query = new URLSearchParams();
      if (params.status) query.set('status', params.status);
      if (params.pageToken) query.set('pageToken', params.pageToken);
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
      let status: number;
      try {
        status = await withTimeout(
          doUpload(url, localUri, headers),
          uploadTimeoutMs,
          'Photo upload',
        );
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(0, 'NETWORK_ERROR', 'Photo upload failed', error);
      }
      if (status < 200 || status >= 300) {
        throw new ApiError(status, 'UPLOAD_FAILED', `Photo upload failed (${status})`);
      }
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
