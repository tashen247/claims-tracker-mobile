import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { policyListResponseSchema } from '@claims/shared';
import { policies } from '../db/schema';

export const policyRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;

  app.get(
    '',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['policies'],
        summary: "List the caller's policies",
        security: [{ bearerAuth: [] }],
        response: { 200: policyListResponseSchema },
      },
    },
    async (request) => {
      const rows = await db
        .select()
        .from(policies)
        .where(eq(policies.userId, request.user.sub))
        .orderBy(asc(policies.type), asc(policies.number));
      return {
        items: rows.map((p) => ({
          id: p.id,
          type: p.type,
          number: p.number,
          status: p.status,
          description: p.description,
          coverAmountCents: p.coverAmountCents,
          startDate: p.startDate,
        })),
      };
    },
  );
};
