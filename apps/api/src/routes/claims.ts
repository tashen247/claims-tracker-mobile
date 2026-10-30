import { and, asc, count, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CLAIM_TYPES_BY_POLICY,
  MAX_PHOTOS_PER_CLAIM,
  canTransition,
  claimDetailSchema,
  claimListResponseSchema,
  claimSchema,
  createClaimRequestSchema,
  errorResponseSchema,
  idParamSchema,
  idempotencyKeySchema,
  isTerminalStatus,
  listClaimsQuerySchema,
  photoUploadUrlRequestSchema,
  photoUploadUrlResponseSchema,
  updateClaimStatusRequestSchema,
  type Claim,
  type ClaimDetail,
} from '@claims/shared';
import type { AccessTokenPayload } from '../plugins/auth';
import {
  claimPhotos,
  claimStatusEvents,
  claims,
  policies,
  pushTokens,
  users,
  type ClaimRow,
} from '../db/schema';
import { hashRequestBody } from '../lib/crypto';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';

const photoCountSql = sql<number>`(select count(*)::int from ${claimPhotos} where ${claimPhotos.claimId} = ${claims.id})`;

export function toClaim(row: ClaimRow, photoCount: number): Claim {
  return {
    id: row.id,
    reference: row.reference,
    policyId: row.policyId,
    userId: row.userId,
    type: row.type,
    incidentDate: row.incidentDate,
    description: row.description,
    amountCents: row.amountCents,
    status: row.status,
    photoCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Policyholders only see their own claims; assessors see all. */
function visibilityFilter(user: AccessTokenPayload): SQL | undefined {
  return user.role === 'assessor' ? undefined : eq(claims.userId, user.sub);
}

const auth = [{ bearerAuth: [] }];

export const claimRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, storage } = app.deps;

  app.addHook('preHandler', app.authenticate);

  async function loadVisibleClaim(id: string, user: AccessTokenPayload): Promise<ClaimRow> {
    const row = await db.query.claims.findFirst({
      where: and(eq(claims.id, id), visibilityFilter(user)),
    });
    // 404 rather than 403 so claim IDs belonging to others can't be probed.
    if (!row) throw notFound('Claim not found');
    return row;
  }

  async function photoCountFor(claimId: string): Promise<number> {
    const [result] = await db
      .select({ value: count() })
      .from(claimPhotos)
      .where(eq(claimPhotos.claimId, claimId));
    return result?.value ?? 0;
  }

  // ---------------------------------------------------------------------------------------------
  // POST /v1/claims  (idempotent)
  // ---------------------------------------------------------------------------------------------
  app.post(
    '',
    {
      preHandler: app.requireRole('policyholder'),
      schema: {
        tags: ['claims'],
        summary: 'Submit a claim (idempotent)',
        description:
          'Requires an `Idempotency-Key` header. Repeating a request with the same key returns the ' +
          'original claim with status 200 instead of creating a duplicate. Reusing a key with a ' +
          'different payload returns 409.',
        security: auth,
        headers: z.looseObject({ 'idempotency-key': idempotencyKeySchema }),
        body: createClaimRequestSchema,
        response: {
          200: claimSchema,
          201: claimSchema,
          400: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const idempotencyKey = request.headers['idempotency-key'];
      const requestHash = hashRequestBody(request.body);

      const replay = async () => {
        const existing = await db.query.claims.findFirst({
          where: and(eq(claims.userId, userId), eq(claims.idempotencyKey, idempotencyKey)),
        });
        if (!existing) return null;
        if (existing.requestHash !== requestHash) {
          throw conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'This Idempotency-Key was already used with a different request body',
          );
        }
        request.log.info({ claimId: existing.id }, 'idempotent replay');
        void reply.header('idempotent-replayed', 'true');
        return reply.status(200).send(toClaim(existing, await photoCountFor(existing.id)));
      };

      const replayed = await replay();
      if (replayed) return replayed;

      const { policyId, type, incidentDate, description, amountCents } = request.body;
      const policy = await db.query.policies.findFirst({
        where: and(eq(policies.id, policyId), eq(policies.userId, userId)),
      });
      if (!policy) throw new AppError(422, 'POLICY_NOT_FOUND', 'Policy not found on your account');
      if (policy.status !== 'active') {
        throw new AppError(
          422,
          'POLICY_NOT_ACTIVE',
          'Claims can only be lodged on active policies',
        );
      }
      if (!CLAIM_TYPES_BY_POLICY[policy.type].includes(type)) {
        throw new AppError(
          422,
          'CLAIM_TYPE_NOT_COVERED',
          'This claim type is not covered by the policy',
        );
      }
      if (incidentDate < policy.startDate) {
        throw new AppError(
          422,
          'INCIDENT_BEFORE_COVER',
          'Incident date is before the policy start date',
        );
      }

      const created = await db.transaction(async (tx) => {
        // ON CONFLICT makes concurrent retries with the same key race-safe at the database level.
        const [row] = await tx
          .insert(claims)
          .values({
            policyId,
            userId,
            type,
            incidentDate,
            description,
            amountCents,
            idempotencyKey,
            requestHash,
          })
          .onConflictDoNothing({ target: [claims.userId, claims.idempotencyKey] })
          .returning();
        if (!row) return null;
        await tx.insert(claimStatusEvents).values({
          claimId: row.id,
          fromStatus: null,
          toStatus: 'submitted',
          note: null,
          actorId: userId,
        });
        return row;
      });

      if (!created) {
        // Lost the race to a concurrent request with the same key.
        const raced = await replay();
        if (raced) return raced;
        throw new AppError(500, 'INTERNAL_ERROR', 'Idempotent insert failed');
      }

      request.log.info({ claimId: created.id, reference: created.reference }, 'claim submitted');
      return reply.status(201).send(toClaim(created, 0));
    },
  );

  // ---------------------------------------------------------------------------------------------
  // GET /v1/claims
  // ---------------------------------------------------------------------------------------------
  app.get(
    '',
    {
      schema: {
        tags: ['claims'],
        summary: 'List claims (own claims for policyholders, all claims for assessors)',
        security: auth,
        querystring: listClaimsQuerySchema,
        response: { 200: claimListResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request) => {
      const { status, limit, cursor } = request.query;
      const filters: (SQL | undefined)[] = [visibilityFilter(request.user)];
      if (status) filters.push(eq(claims.status, status));
      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (!decoded) throw badRequest('Invalid cursor');
        filters.push(
          or(
            lt(claims.createdAt, decoded.createdAt),
            and(eq(claims.createdAt, decoded.createdAt), lt(claims.id, decoded.id)),
          ),
        );
      }

      const rows = await db
        .select({ claim: claims, photoCount: photoCountSql })
        .from(claims)
        .where(and(...filters))
        .orderBy(desc(claims.createdAt), desc(claims.id))
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((r) => toClaim(r.claim, r.photoCount)),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({ createdAt: last.claim.createdAt, id: last.claim.id })
            : null,
      };
    },
  );

  // ---------------------------------------------------------------------------------------------
  // GET /v1/claims/:id
  // ---------------------------------------------------------------------------------------------
  app.get(
    '/:id',
    {
      schema: {
        tags: ['claims'],
        summary: 'Claim detail with photos and status timeline',
        security: auth,
        params: idParamSchema,
        response: { 200: claimDetailSchema, 404: errorResponseSchema },
      },
    },
    async (request): Promise<ClaimDetail> => {
      const claim = await loadVisibleClaim(request.params.id, request.user);

      const [policy, claimant, photos, events] = await Promise.all([
        db.query.policies.findFirst({ where: eq(policies.id, claim.policyId) }),
        db.query.users.findFirst({ where: eq(users.id, claim.userId) }),
        db
          .select()
          .from(claimPhotos)
          .where(eq(claimPhotos.claimId, claim.id))
          .orderBy(asc(claimPhotos.createdAt)),
        db
          .select({
            event: claimStatusEvents,
            actor: { id: users.id, fullName: users.fullName, role: users.role },
          })
          .from(claimStatusEvents)
          .innerJoin(users, eq(users.id, claimStatusEvents.actorId))
          .where(eq(claimStatusEvents.claimId, claim.id))
          .orderBy(asc(claimStatusEvents.createdAt), asc(claimStatusEvents.id)),
      ]);
      if (!policy || !claimant) throw notFound('Claim not found');

      return {
        ...toClaim(claim, photos.length),
        policy: { id: policy.id, number: policy.number, type: policy.type },
        claimant: { id: claimant.id, fullName: claimant.fullName, email: claimant.email },
        photos: await Promise.all(
          photos.map(async (p) => ({
            id: p.id,
            url: await storage.presignDownload(p.s3Key),
            contentType: p.contentType,
            createdAt: p.createdAt.toISOString(),
          })),
        ),
        events: events.map(({ event, actor }) => ({
          id: event.id,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          note: event.note,
          actor,
          createdAt: event.createdAt.toISOString(),
        })),
      };
    },
  );

  // ---------------------------------------------------------------------------------------------
  // POST /v1/claims/:id/photos/upload-url
  // ---------------------------------------------------------------------------------------------
  app.post(
    '/:id/photos/upload-url',
    {
      preHandler: app.requireRole('policyholder'),
      schema: {
        tags: ['claims'],
        summary: 'Get a pre-signed S3 URL to upload one claim photo',
        security: auth,
        params: idParamSchema,
        body: photoUploadUrlRequestSchema,
        response: {
          201: photoUploadUrlResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const claim = await loadVisibleClaim(request.params.id, request.user);
      if (claim.userId !== request.user.sub) throw forbidden();
      if (isTerminalStatus(claim.status) || claim.status === 'approved') {
        throw conflict('CLAIM_CLOSED', 'Photos cannot be added to a closed claim');
      }

      const { contentType } = request.body;
      const key = storage.buildKey(claim.id, contentType);

      const photo = await db.transaction(async (tx) => {
        // Lock the claim row so concurrent requests can't exceed the photo limit.
        await tx.execute(sql`select id from ${claims} where ${claims.id} = ${claim.id} for update`);
        const [existing] = await tx
          .select({ value: count() })
          .from(claimPhotos)
          .where(eq(claimPhotos.claimId, claim.id));
        if ((existing?.value ?? 0) >= MAX_PHOTOS_PER_CLAIM) {
          throw conflict(
            'PHOTO_LIMIT_REACHED',
            `A claim can have at most ${MAX_PHOTOS_PER_CLAIM} photos`,
          );
        }
        const [row] = await tx
          .insert(claimPhotos)
          .values({ claimId: claim.id, s3Key: key, contentType })
          .returning();
        return row!;
      });

      const upload = await storage.presignUpload(key, contentType);
      return reply.status(201).send({
        photoId: photo.id,
        uploadUrl: upload.url,
        method: 'PUT' as const,
        headers: upload.headers,
        expiresIn: upload.expiresIn,
      });
    },
  );

  // ---------------------------------------------------------------------------------------------
  // PATCH /v1/claims/:id/status  (assessor only, audited)
  // ---------------------------------------------------------------------------------------------
  app.patch(
    '/:id/status',
    {
      preHandler: app.requireRole('assessor'),
      schema: {
        tags: ['claims'],
        summary: 'Change claim status (assessor only); writes an audit event',
        security: auth,
        params: idParamSchema,
        body: updateClaimStatusRequestSchema,
        response: {
          200: claimSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { status, note } = request.body;
      const actorId = request.user.sub;

      const updated = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(claims)
          .where(eq(claims.id, request.params.id))
          .for('update');
        if (!current) throw notFound('Claim not found');
        if (!canTransition(current.status, status)) {
          throw conflict(
            'INVALID_STATUS_TRANSITION',
            `Cannot move a claim from ${current.status} to ${status}`,
            { from: current.status, to: status },
          );
        }
        const [row] = await tx
          .update(claims)
          .set({ status, updatedAt: new Date() })
          .where(eq(claims.id, current.id))
          .returning();
        await tx.insert(claimStatusEvents).values({
          claimId: current.id,
          fromStatus: current.status,
          toStatus: status,
          note,
          actorId,
        });
        return row!;
      });

      request.log.info({ claimId: updated.id, toStatus: status, actorId }, 'claim status changed');

      const tokens = await db
        .select({ token: pushTokens.token })
        .from(pushTokens)
        .where(eq(pushTokens.userId, updated.userId));
      if (tokens.length > 0) {
        try {
          const { invalidTokens } = await app.deps.notifier.claimStatusChanged({
            tokens: tokens.map((t) => t.token),
            claimId: updated.id,
            reference: updated.reference,
            status,
          });
          if (invalidTokens.length > 0) {
            await db.delete(pushTokens).where(inArray(pushTokens.token, invalidTokens));
          }
        } catch (error) {
          request.log.error({ err: error, claimId: updated.id }, 'push notification failed');
        }
      }

      return toClaim(updated, await photoCountFor(updated.id));
    },
  );
};
