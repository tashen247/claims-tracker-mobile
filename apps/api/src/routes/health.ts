import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { healthResponseSchema } from '@claims/shared';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      logLevel: 'warn',
      schema: {
        tags: ['health'],
        summary: 'Liveness and dependency checks',
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (_request, reply) => {
      const { db, redis, config } = app.deps;
      const checks: Record<string, 'ok' | 'fail'> = {};

      try {
        await db.execute(sql`select 1`);
        checks.database = 'ok';
      } catch {
        checks.database = 'fail';
      }
      if (redis) {
        try {
          await redis.ping();
          checks.redis = 'ok';
        } catch {
          checks.redis = 'fail';
        }
      }

      const healthy = Object.values(checks).every((c) => c === 'ok');
      return reply
        .status(healthy ? 200 : 503)
        .send({ status: healthy ? 'ok' : 'degraded', version: config.APP_VERSION, checks });
    },
  );
};
