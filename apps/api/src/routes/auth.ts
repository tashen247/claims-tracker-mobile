import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  authResponseSchema,
  errorResponseSchema,
  loginRequestSchema,
  refreshRequestSchema,
  registerPushTokenRequestSchema,
  registerRequestSchema,
  userSchema,
  type User,
} from '@claims/shared';
import { policies, pushTokens, refreshTokens, users, type UserRow } from '../db/schema';
import { generateRefreshToken, hashPassword, sha256, verifyPassword } from '../lib/crypto';
import { AppError, conflict, unauthorized } from '../lib/errors';
import { starterPolicies } from '../services/demo-policies';

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, fullName: row.fullName, role: row.role };
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, config } = app.deps;
  const rateLimit = { max: config.AUTH_RATE_LIMIT_MAX, timeWindow: config.AUTH_RATE_LIMIT_WINDOW };
  const dummyHash = hashPassword(randomUUID(), config.BCRYPT_ROUNDS);

  async function issueTokens(user: UserRow, familyId: string = randomUUID()) {
    const refreshToken = generateRefreshToken();
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    });
    const accessToken = app.jwt.sign({ sub: user.id, role: user.role });
    return {
      accessToken,
      refreshToken,
      expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
      user: toUser(user),
    };
  }

  app.post(
    '/register',
    {
      config: { rateLimit },
      schema: {
        tags: ['auth'],
        summary: 'Create a policyholder account',
        body: registerRequestSchema,
        response: { 201: authResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password, fullName } = request.body;
      const passwordHash = await hashPassword(password, config.BCRYPT_ROUNDS);

      const user = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({ email, fullName, passwordHash, role: 'policyholder' })
          .onConflictDoNothing({ target: users.email })
          .returning();
        if (!created) throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
        await tx
          .insert(policies)
          .values(starterPolicies().map((p) => ({ ...p, userId: created.id })));
        return created;
      });

      request.log.info({ userId: user.id }, 'user registered');
      return reply.status(201).send(await issueTokens(user));
    },
  );

  app.post(
    '/login',
    {
      config: { rateLimit },
      schema: {
        tags: ['auth'],
        summary: 'Log in with email and password',
        body: loginRequestSchema,
        response: { 200: authResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      const { email, password } = request.body;
      const user = await db.query.users.findFirst({ where: eq(users.email, email) });
      // Compare against a dummy hash for unknown emails so response time doesn't reveal accounts.
      const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
      if (!user || !valid) throw unauthorized('Incorrect email or password');
      return issueTokens(user);
    },
  );

  app.post(
    '/refresh',
    {
      config: { rateLimit },
      schema: {
        tags: ['auth'],
        summary: 'Rotate a refresh token for a new token pair',
        body: refreshRequestSchema,
        response: { 200: authResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      const tokenHash = sha256(request.body.refreshToken);
      const existing = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.tokenHash, tokenHash),
      });
      if (!existing) throw unauthorized('Invalid refresh token');

      if (existing.revokedAt) {
        // A rotated token was presented again: assume theft and revoke the whole family.
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(eq(refreshTokens.familyId, existing.familyId), isNull(refreshTokens.revokedAt)),
          );
        request.log.warn({ userId: existing.userId }, 'refresh token reuse detected');
        throw unauthorized('Refresh token has already been used');
      }
      if (existing.expiresAt.getTime() < Date.now()) throw unauthorized('Refresh token expired');

      const [revoked] = await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.id, existing.id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });
      if (!revoked) throw unauthorized('Refresh token has already been used');

      const user = await db.query.users.findFirst({ where: eq(users.id, existing.userId) });
      if (!user) throw unauthorized('Account no longer exists');
      return issueTokens(user, existing.familyId);
    },
  );

  app.post(
    '/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Revoke a refresh token',
        body: refreshRequestSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokens.tokenHash, sha256(request.body.refreshToken)),
            isNull(refreshTokens.revokedAt),
          ),
        );
      return reply.status(204).send(null);
    },
  );
};

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;
  app.addHook('preHandler', app.authenticate);

  app.get(
    '',
    {
      schema: {
        tags: ['me'],
        summary: 'Current user',
        security: [{ bearerAuth: [] }],
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const user = await db.query.users.findFirst({ where: eq(users.id, request.user.sub) });
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Account no longer exists');
      return toUser(user);
    },
  );

  app.post(
    '/push-tokens',
    {
      schema: {
        tags: ['me'],
        summary: 'Register this device for push notifications',
        security: [{ bearerAuth: [] }],
        body: registerPushTokenRequestSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { token, platform } = request.body;
      await db
        .insert(pushTokens)
        .values({ userId: request.user.sub, token, platform })
        .onConflictDoUpdate({
          target: pushTokens.token,
          set: { userId: request.user.sub, platform, lastSeenAt: new Date() },
        });
      return reply.status(204).send(null);
    },
  );

  app.delete(
    '/push-tokens',
    {
      schema: {
        tags: ['me'],
        summary: 'Unregister a device (on logout)',
        security: [{ bearerAuth: [] }],
        body: registerPushTokenRequestSchema.pick({ token: true }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await db
        .delete(pushTokens)
        .where(
          and(eq(pushTokens.token, request.body.token), eq(pushTokens.userId, request.user.sub)),
        );
      return reply.status(204).send(null);
    },
  );
};
