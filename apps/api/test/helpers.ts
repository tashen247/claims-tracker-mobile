import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import type { AuthResponse, PhotoContentType } from '@claims/shared';
import { buildApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import { createDatabase, type DatabaseHandle } from '../src/db/client';
import { users } from '../src/db/schema';
import { hashPassword } from '../src/lib/crypto';
import type { ClaimStatusNotification, Notifier } from '../src/services/notifier';
import { photoKey, type PhotoStorage } from '../src/services/storage';

export class FakeStorage implements PhotoStorage {
  buildKey(claimId: string, contentType: PhotoContentType) {
    return photoKey(claimId, contentType);
  }
  async presignUpload(key: string, contentType: PhotoContentType) {
    return {
      url: `https://s3.test/upload/${key}?sig=1`,
      headers: { 'Content-Type': contentType },
      expiresIn: 600,
    };
  }
  async presignDownload(key: string) {
    return `https://s3.test/download/${key}?sig=1`;
  }
}

export class RecordingNotifier implements Notifier {
  calls: ClaimStatusNotification[] = [];
  invalid: string[] = [];
  async claimStatusChanged(n: ClaimStatusNotification) {
    this.calls.push(n);
    return { invalidTokens: n.tokens.filter((t) => this.invalid.includes(t)) };
  }
}

export interface TestContext {
  app: FastifyInstance;
  database: DatabaseHandle;
  notifier: RecordingNotifier;
  config: Config;
  close: () => Promise<void>;
}

export async function createTestContext(
  overrides: Partial<Record<string, string>> = {},
): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    BCRYPT_ROUNDS: '4',
    AUTH_RATE_LIMIT_MAX: '1000',
    ...overrides,
  });
  const database = createDatabase(config.DATABASE_URL, { max: 5 });
  const notifier = new RecordingNotifier();
  const app = await buildApp({ config, db: database.db, storage: new FakeStorage(), notifier });
  await app.ready();
  return {
    app,
    database,
    notifier,
    config,
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}

export async function resetDatabase(ctx: TestContext) {
  await ctx.database.db.execute(
    sql`truncate table claim_status_events, claim_photos, claims, policies, push_tokens, refresh_tokens, users cascade`,
  );
}

let counter = 0;
export async function registerUser(ctx: TestContext, name = 'Test User'): Promise<AuthResponse> {
  counter += 1;
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: {
      email: `user${counter}-${Date.now()}@example.co.za`,
      password: 'Password123',
      fullName: name,
    },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  return res.json();
}

export async function createAssessor(ctx: TestContext): Promise<AuthResponse> {
  counter += 1;
  const email = `assessor${counter}@example.co.za`;
  await ctx.database.db.insert(users).values({
    email,
    fullName: 'Ayanda Khumalo',
    role: 'assessor',
    passwordHash: await hashPassword('Password123', 4),
  });
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password: 'Password123' },
  });
  return res.json();
}

export const bearer = (auth: AuthResponse) => ({ authorization: `Bearer ${auth.accessToken}` });

export async function firstPolicyId(ctx: TestContext, auth: AuthResponse, type = 'motor_warranty') {
  const res = await ctx.app.inject({ method: 'GET', url: '/v1/policies', headers: bearer(auth) });
  const policy = res.json().items.find((p: { type: string }) => p.type === type);
  return policy.id as string;
}

export function claimPayload(policyId: string, overrides: Record<string, unknown> = {}) {
  return {
    policyId,
    type: 'mechanical_breakdown',
    incidentDate: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10),
    description: 'Gearbox failed on the N1 near Midrand, towed to the dealer.',
    amountCents: 1_850_000,
    ...overrides,
  };
}
