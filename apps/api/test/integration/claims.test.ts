import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthResponse } from '@claims/shared';
import { claimStatusEvents, claims, policies, pushTokens } from '../../src/db/schema';
import {
  bearer,
  claimPayload,
  createAssessor,
  createTestContext,
  firstPolicyId,
  registerUser,
  resetDatabase,
  type TestContext,
} from '../helpers';

let ctx: TestContext;
let holder: AuthResponse;
let other: AuthResponse;
let assessor: AuthResponse;
let policyId: string;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx);
  ctx.notifier.calls = [];
  holder = await registerUser(ctx, 'Thandi Nkosi');
  other = await registerUser(ctx, 'Sipho Dlamini');
  assessor = await createAssessor(ctx);
  policyId = await firstPolicyId(ctx, holder);
});

const submit = (auth: AuthResponse, key: string | undefined, payload: object) =>
  ctx.app.inject({
    method: 'POST',
    url: '/v1/claims',
    headers: { ...bearer(auth), ...(key ? { 'idempotency-key': key } : {}) },
    payload,
  });

describe('POST /v1/claims idempotency', () => {
  it('creates a claim with a reference and an initial audit event', async () => {
    const res = await submit(holder, 'key-create-0001', claimPayload(policyId));
    expect(res.statusCode).toBe(201);
    const claim = res.json();
    expect(claim).toMatchObject({ status: 'submitted', amountCents: 1_850_000, photoCount: 0 });
    expect(claim.reference).toMatch(/^CLM-\d{6}$/);

    const events = await ctx.database.db
      .select()
      .from(claimStatusEvents)
      .where(eq(claimStatusEvents.claimId, claim.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'submitted',
      actorId: holder.user.id,
    });
  });

  it('returns the original claim for a repeated key and never duplicates', async () => {
    const payload = claimPayload(policyId);
    const first = await submit(holder, 'key-repeat-0001', payload);
    const second = await submit(holder, 'key-repeat-0001', payload);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json().id).toBe(first.json().id);

    const rows = await ctx.database.db
      .select()
      .from(claims)
      .where(eq(claims.userId, holder.user.id));
    expect(rows).toHaveLength(1);
  });

  it('is safe under concurrent retries with the same key', async () => {
    const payload = claimPayload(policyId);
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => submit(holder, 'key-concurrent-01', payload)),
    );
    const ids = new Set(responses.map((r) => r.json().id));
    expect(ids.size).toBe(1);
    expect(responses.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(responses.every((r) => [200, 201].includes(r.statusCode))).toBe(true);

    const rows = await ctx.database.db
      .select()
      .from(claims)
      .where(eq(claims.userId, holder.user.id));
    expect(rows).toHaveLength(1);
  });

  it('rejects reusing a key with a different body', async () => {
    await submit(holder, 'key-mismatch-01', claimPayload(policyId));
    const res = await submit(
      holder,
      'key-mismatch-01',
      claimPayload(policyId, { amountCents: 99_900 }),
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('scopes keys per user', async () => {
    const otherPolicy = await firstPolicyId(ctx, other);
    const a = await submit(holder, 'shared-key-0001', claimPayload(policyId));
    const b = await submit(other, 'shared-key-0001', claimPayload(otherPolicy));
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json().id).not.toBe(b.json().id);
  });

  it('requires a valid Idempotency-Key header', async () => {
    const missing = await submit(holder, undefined, claimPayload(policyId));
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('VALIDATION_ERROR');
    expect((await submit(holder, 'bad key!', claimPayload(policyId))).statusCode).toBe(400);
  });
});

describe('POST /v1/claims business rules', () => {
  it('rejects claims on policies the user does not own', async () => {
    const otherPolicy = await firstPolicyId(ctx, other);
    const res = await submit(holder, 'key-foreign-001', claimPayload(otherPolicy));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('POLICY_NOT_FOUND');
  });

  it('rejects claim types the policy does not cover', async () => {
    const res = await submit(
      holder,
      'key-type-00001',
      claimPayload(policyId, { type: 'death_of_member' }),
    );
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('CLAIM_TYPE_NOT_COVERED');
  });

  it('rejects lapsed policies and incidents before cover started', async () => {
    await ctx.database.db
      .update(policies)
      .set({ status: 'lapsed' })
      .where(eq(policies.id, policyId));
    const lapsed = await submit(holder, 'key-lapsed-0001', claimPayload(policyId));
    expect(lapsed.json().error.code).toBe('POLICY_NOT_ACTIVE');

    await ctx.database.db
      .update(policies)
      .set({ status: 'active' })
      .where(eq(policies.id, policyId));
    const early = await submit(
      holder,
      'key-early-00001',
      claimPayload(policyId, { incidentDate: '2001-01-01' }),
    );
    expect(early.json().error.code).toBe('INCIDENT_BEFORE_COVER');
  });

  it('does not let assessors submit claims', async () => {
    const res = await submit(assessor, 'key-assessor-01', claimPayload(policyId));
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /v1/claims', () => {
  it('shows policyholders only their own claims and assessors everything', async () => {
    const otherPolicy = await firstPolicyId(ctx, other);
    await submit(holder, 'list-key-000001', claimPayload(policyId));
    await submit(
      holder,
      'list-key-000002',
      claimPayload(policyId, { description: 'Second breakdown on the N2.' }),
    );
    await submit(other, 'list-key-000003', claimPayload(otherPolicy));

    const mine = await ctx.app.inject({
      method: 'GET',
      url: '/v1/claims',
      headers: bearer(holder),
    });
    expect(mine.json().items).toHaveLength(2);
    expect(mine.json().items.every((c: { userId: string }) => c.userId === holder.user.id)).toBe(
      true,
    );

    const all = await ctx.app.inject({
      method: 'GET',
      url: '/v1/claims',
      headers: bearer(assessor),
    });
    expect(all.json().items).toHaveLength(3);
  });

  it('filters by status and paginates with a cursor', async () => {
    for (let i = 0; i < 5; i += 1) {
      await submit(
        holder,
        `page-key-00000${i}`,
        claimPayload(policyId, { amountCents: 100_000 + i }),
      );
    }
    const page1 = await ctx.app.inject({
      method: 'GET',
      url: '/v1/claims?limit=2',
      headers: bearer(holder),
    });
    expect(page1.json().items).toHaveLength(2);
    const cursor = page1.json().nextCursor as string;
    expect(cursor).toBeTruthy();

    const page2 = await ctx.app.inject({
      method: 'GET',
      url: `/v1/claims?limit=2&cursor=${cursor}`,
      headers: bearer(holder),
    });
    const ids1 = page1.json().items.map((c: { id: string }) => c.id);
    const ids2 = page2.json().items.map((c: { id: string }) => c.id);
    expect(ids2.some((id: string) => ids1.includes(id))).toBe(false);

    const page3 = await ctx.app.inject({
      method: 'GET',
      url: `/v1/claims?limit=2&cursor=${page2.json().nextCursor}`,
      headers: bearer(holder),
    });
    expect(page3.json().items).toHaveLength(1);
    expect(page3.json().nextCursor).toBeNull();

    const filtered = await ctx.app.inject({
      method: 'GET',
      url: '/v1/claims?status=approved',
      headers: bearer(holder),
    });
    expect(filtered.json().items).toHaveLength(0);

    const badCursor = await ctx.app.inject({
      method: 'GET',
      url: '/v1/claims?cursor=garbage',
      headers: bearer(holder),
    });
    expect(badCursor.statusCode).toBe(400);
  });
});

describe('GET /v1/claims/:id', () => {
  it('returns detail with timeline to the owner and assessors, 404 to others', async () => {
    const claim = (await submit(holder, 'detail-key-0001', claimPayload(policyId))).json();

    const own = await ctx.app.inject({
      method: 'GET',
      url: `/v1/claims/${claim.id}`,
      headers: bearer(holder),
    });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toMatchObject({
      id: claim.id,
      claimant: { fullName: 'Thandi Nkosi' },
      policy: { id: policyId },
    });
    expect(own.json().events).toHaveLength(1);

    const asAssessor = await ctx.app.inject({
      method: 'GET',
      url: `/v1/claims/${claim.id}`,
      headers: bearer(assessor),
    });
    expect(asAssessor.statusCode).toBe(200);

    const asOther = await ctx.app.inject({
      method: 'GET',
      url: `/v1/claims/${claim.id}`,
      headers: bearer(other),
    });
    expect(asOther.statusCode).toBe(404);
  });
});

describe('POST /v1/claims/:id/photos/upload-url', () => {
  it('issues pre-signed URLs up to the limit of 5', async () => {
    const claim = (await submit(holder, 'photo-key-00001', claimPayload(policyId))).json();
    const request = () =>
      ctx.app.inject({
        method: 'POST',
        url: `/v1/claims/${claim.id}/photos/upload-url`,
        headers: bearer(holder),
        payload: { contentType: 'image/jpeg' },
      });

    const results = [];
    for (let i = 0; i < 6; i += 1) results.push(await request());
    expect(results.slice(0, 5).every((r) => r.statusCode === 201)).toBe(true);
    expect(results[0]!.json()).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
    });
    expect(results[0]!.json().uploadUrl).toContain(`claims/${claim.id}/`);
    expect(results[5]!.statusCode).toBe(409);
    expect(results[5]!.json().error.code).toBe('PHOTO_LIMIT_REACHED');

    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/v1/claims/${claim.id}`,
      headers: bearer(holder),
    });
    expect(detail.json().photos).toHaveLength(5);
    expect(detail.json().photoCount).toBe(5);
  });

  it("blocks uploads to other users' claims, by assessors and on closed claims", async () => {
    const claim = (await submit(holder, 'photo-key-00002', claimPayload(policyId))).json();
    const url = `/v1/claims/${claim.id}/photos/upload-url`;
    const payload = { contentType: 'image/png' };
    expect(
      (await ctx.app.inject({ method: 'POST', url, headers: bearer(other), payload })).statusCode,
    ).toBe(404);
    expect(
      (await ctx.app.inject({ method: 'POST', url, headers: bearer(assessor), payload }))
        .statusCode,
    ).toBe(403);

    await ctx.database.db.update(claims).set({ status: 'paid' }).where(eq(claims.id, claim.id));
    const closed = await ctx.app.inject({ method: 'POST', url, headers: bearer(holder), payload });
    expect(closed.statusCode).toBe(409);
    expect(closed.json().error.code).toBe('CLAIM_CLOSED');
  });
});

describe('PATCH /v1/claims/:id/status', () => {
  const patch = (auth: AuthResponse, id: string, body: object) =>
    ctx.app.inject({
      method: 'PATCH',
      url: `/v1/claims/${id}/status`,
      headers: bearer(auth),
      payload: body,
    });

  it('is assessor-only', async () => {
    const claim = (await submit(holder, 'status-key-0001', claimPayload(policyId))).json();
    const res = await patch(holder, claim.id, { status: 'in_review', note: 'Self-approve' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('requires a note and a valid transition', async () => {
    const claim = (await submit(holder, 'status-key-0002', claimPayload(policyId))).json();
    expect((await patch(assessor, claim.id, { status: 'in_review', note: '' })).statusCode).toBe(
      400,
    );

    const skip = await patch(assessor, claim.id, { status: 'paid', note: 'Pay it now' });
    expect(skip.statusCode).toBe(409);
    expect(skip.json().error).toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      details: { from: 'submitted', to: 'paid' },
    });

    const missing = await patch(assessor, '6f1c1f9e-8a3b-4c2d-9e1f-0a1b2c3d4e5f', {
      status: 'in_review',
      note: 'Looking',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('audits every change and notifies the claimant', async () => {
    const claim = (await submit(holder, 'status-key-0003', claimPayload(policyId))).json();
    await ctx.database.db.insert(pushTokens).values([
      { userId: holder.user.id, token: 'ExponentPushToken[good]', platform: 'ios' },
      { userId: holder.user.id, token: 'ExponentPushToken[stale]', platform: 'android' },
    ]);
    ctx.notifier.invalid = ['ExponentPushToken[stale]'];

    expect(
      (await patch(assessor, claim.id, { status: 'in_review', note: 'Assigned to me' })).statusCode,
    ).toBe(200);
    const approved = await patch(assessor, claim.id, {
      status: 'approved',
      note: 'Quote verified',
    });
    expect(approved.json().status).toBe('approved');

    const detail = (
      await ctx.app.inject({
        method: 'GET',
        url: `/v1/claims/${claim.id}`,
        headers: bearer(holder),
      })
    ).json();
    expect(detail.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      'submitted',
      'in_review',
      'approved',
    ]);
    expect(detail.events[2]).toMatchObject({
      fromStatus: 'in_review',
      note: 'Quote verified',
      actor: { id: assessor.user.id, role: 'assessor' },
    });

    expect(ctx.notifier.calls).toHaveLength(2);
    expect(ctx.notifier.calls[1]).toMatchObject({ claimId: claim.id, status: 'approved' });
    expect(ctx.notifier.calls[0]!.tokens).toHaveLength(2);

    // The stale token reported by the push service was removed.
    const remaining = await ctx.database.db
      .select()
      .from(pushTokens)
      .where(eq(pushTokens.userId, holder.user.id));
    expect(remaining.map((t) => t.token)).toEqual(['ExponentPushToken[good]']);
  });
});
