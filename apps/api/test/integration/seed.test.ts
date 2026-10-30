import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canTransition } from '@claims/shared';
import { claimStatusEvents, claims, users } from '../../src/db/schema';
import {
  DEMO_ASSESSOR_EMAIL,
  DEMO_PASSWORD,
  DEMO_POLICYHOLDER_EMAIL,
  seed,
} from '../../src/db/seed';
import { createTestContext, resetDatabase, type TestContext } from '../helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await resetDatabase(ctx);
  await ctx.close();
});

describe('seed', () => {
  it('creates demo logins and claims whose histories follow the status machine', async () => {
    const result = await seed(ctx.database.db, { claimCount: 120, bcryptRounds: 4 });
    expect(result).toEqual({ users: 9, policies: 24, claims: 120 });

    const assessor = await ctx.database.db.query.users.findFirst({
      where: eq(users.email, DEMO_ASSESSOR_EMAIL),
    });
    expect(assessor?.role).toBe('assessor');

    for (const email of [DEMO_POLICYHOLDER_EMAIL, DEMO_ASSESSOR_EMAIL]) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email, password: DEMO_PASSWORD },
      });
      expect(res.statusCode).toBe(200);
    }

    const rows = await ctx.database.db.select().from(claims);
    const events = await ctx.database.db.select().from(claimStatusEvents);
    for (const claim of rows.slice(0, 40)) {
      const history = events
        .filter((e) => e.claimId === claim.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      expect(history[0]?.toStatus).toBe('submitted');
      expect(history.at(-1)?.toStatus).toBe(claim.status);
      for (const event of history.slice(1)) {
        expect(canTransition(event.fromStatus!, event.toStatus)).toBe(true);
      }
    }

    // Re-running is safe and replaces the data.
    await seed(ctx.database.db, { claimCount: 10, bcryptRounds: 4 });
    const [total] = await ctx.database.db.select({ value: count() }).from(claims);
    expect(total?.value).toBe(10);
  });
});
