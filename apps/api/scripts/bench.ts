/**
 * Measures p95 latency of the list endpoints over HTTP against the seeded database.
 * Usage: pnpm db:seed && pnpm --filter @claims/api bench
 */
import { performance } from 'node:perf_hooks';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDatabase } from '../src/db/client';
import { DEMO_ASSESSOR_EMAIL, DEMO_PASSWORD, DEMO_POLICYHOLDER_EMAIL } from '../src/db/seed';
import { NoopNotifier } from '../src/services/notifier';
import { S3PhotoStorage } from '../src/services/storage';

const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 300);
const P95_BUDGET_MS = 200;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

async function main() {
  const config = { ...loadConfig(), LOG_LEVEL: 'silent' as const, NODE_ENV: 'test' as const };
  const database = createDatabase(config.DATABASE_URL);
  const app = await buildApp({
    config,
    db: database.db,
    storage: new S3PhotoStorage(config),
    notifier: new NoopNotifier(),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  const login = async (email: string) => {
    const res = await fetch(`${base}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: DEMO_PASSWORD }),
    });
    if (!res.ok) throw new Error(`Login failed for ${email}; run pnpm db:seed first`);
    return ((await res.json()) as { accessToken: string }).accessToken;
  };

  const scenarios = [
    {
      name: 'GET /v1/claims (assessor, all 1,000)',
      token: await login(DEMO_ASSESSOR_EMAIL),
      path: '/v1/claims?limit=50',
    },
    {
      name: 'GET /v1/claims?status=in_review (assessor)',
      token: await login(DEMO_ASSESSOR_EMAIL),
      path: '/v1/claims?status=in_review&limit=50',
    },
    {
      name: 'GET /v1/claims (policyholder)',
      token: await login(DEMO_POLICYHOLDER_EMAIL),
      path: '/v1/claims?limit=50',
    },
    {
      name: 'GET /v1/policies (policyholder)',
      token: await login(DEMO_POLICYHOLDER_EMAIL),
      path: '/v1/policies',
    },
  ];

  let failed = false;
  for (const scenario of scenarios) {
    const timings: number[] = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      const start = performance.now();
      const res = await fetch(`${base}${scenario.path}`, {
        headers: { authorization: `Bearer ${scenario.token}` },
      });
      await res.arrayBuffer();
      timings.push(performance.now() - start);
    }
    const p50 = percentile(timings, 50);
    const p95 = percentile(timings, 95);
    const ok = p95 < P95_BUDGET_MS;
    failed ||= !ok;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${scenario.name.padEnd(46)} p50 ${p50.toFixed(1)} ms  p95 ${p95.toFixed(1)} ms`,
    );
  }

  await app.close();
  await database.close();
  if (failed) process.exitCode = 1;
}

void main();
