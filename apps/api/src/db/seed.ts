/**
 * Seeds demo users, policies and 1,000 claims with South African sample data.
 * Idempotent: wipes demo data and recreates it. Run with `pnpm db:seed`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import {
  CLAIM_STATUS_TRANSITIONS,
  CLAIM_TYPES_BY_POLICY,
  type ClaimStatus,
  type PolicyType,
} from '@claims/shared';
import { loadConfig } from '../config';
import { hashPassword } from '../lib/crypto';
import { createDatabase, type Database } from './client';
import { claimStatusEvents, claims, policies, users } from './schema';

export const DEMO_PASSWORD = 'Password123!';
export const DEMO_POLICYHOLDER_EMAIL = 'thandi@example.co.za';
export const DEMO_ASSESSOR_EMAIL = 'assessor@example.co.za';

/** Deterministic PRNG so every seed run produces the same data. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POLICYHOLDERS = [
  { email: DEMO_POLICYHOLDER_EMAIL, fullName: 'Thandi Nkosi' },
  { email: 'sipho.dlamini@example.co.za', fullName: 'Sipho Dlamini' },
  { email: 'aisha.patel@example.co.za', fullName: 'Aisha Patel' },
  { email: 'pieter.vandermerwe@example.co.za', fullName: 'Pieter van der Merwe' },
  { email: 'lerato.mokoena@example.co.za', fullName: 'Lerato Mokoena' },
  { email: 'johan.botha@example.co.za', fullName: 'Johan Botha' },
  { email: 'nomvula.zulu@example.co.za', fullName: 'Nomvula Zulu' },
  { email: 'kagiso.molefe@example.co.za', fullName: 'Kagiso Molefe' },
];

const VEHICLES = [
  '2021 Toyota Corolla Cross 1.8 XS',
  '2019 Volkswagen Polo Vivo 1.4 Trendline',
  '2020 Ford Ranger 2.2 XL double cab',
  '2018 Suzuki Swift 1.2 GL',
  '2022 Hyundai Grand i10 1.2 Fluid',
  '2017 Toyota Hilux 2.4 GD-6 Raider',
  '2020 Nissan NP200 1.6 8V',
  '2021 Kia Picanto 1.2 Style',
];

const DESCRIPTIONS: Record<PolicyType, string[]> = {
  motor_warranty: [
    'Gearbox started slipping on the N1 between Midrand and Centurion; towed to dealer.',
    'Engine overheated in traffic on the M1; workshop diagnosed a failed water pump.',
    'Clutch master cylinder failed, pedal went to the floor outside Gqeberha.',
    'Turbo failure on the N2 near Plettenberg Bay, loss of power and blue smoke.',
    'Air-con compressor seized during a Durban heatwave; quote attached.',
    'Central locking and electric windows stopped working after load-shedding surge.',
    'Alternator failed, battery warning light on and car would not restart in Sandton.',
    'ECU fault code P0300 with misfires, dealer recommends injector replacement.',
  ],
  funeral: [
    'Death of a dependant (mother) at Livingstone Hospital, Gqeberha. Death certificate attached.',
    'Death of a dependant (father) in Polokwane; funeral arranged for Saturday.',
    'Death of a child dependant; BI-1663 and death certificate uploaded.',
    'Death of spouse after a long illness at Chris Hani Baragwanath Hospital.',
  ],
  legal: [
    'Unfair dismissal dispute with former employer; CCMA referral required.',
    'Landlord in Cape Town withholding deposit beyond 14 days after lease ended.',
    'Consumer dispute with a dealership over a defective vehicle sold voetstoets.',
    'Summons received for a disputed municipal account in Johannesburg.',
    'Need representation at a disciplinary hearing at work next week.',
  ],
};

const ASSESSOR_NOTES: Partial<Record<ClaimStatus, string[]>> = {
  in_review: ['Assigned for assessment.', 'Documents received and under review.'],
  more_info_needed: [
    'Please upload the workshop job card and service history.',
    'Please provide a certified copy of the death certificate.',
    'Please upload the CCMA referral form.',
  ],
  approved: [
    'Quote verified against parts pricing; approved.',
    'All documents in order. Approved.',
  ],
  rejected: [
    'Wear-and-tear item excluded under section 4.2 of the warranty.',
    'Incident falls within the waiting period.',
  ],
  paid: [
    'EFT released to the nominated bank account.',
    'Payment made directly to the service provider.',
  ],
};

const AMOUNT_RANGES: Record<PolicyType, [number, number]> = {
  motor_warranty: [3_500_00, 85_000_00],
  funeral: [10_000_00, 30_000_00],
  legal: [2_500_00, 45_000_00],
};

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

/** Walks a random path through the status machine so every seeded history is valid. */
function randomHistory(rand: () => number): ClaimStatus[] {
  const path: ClaimStatus[] = ['submitted'];
  const depth = Math.floor(rand() * 5);
  for (let i = 0; i < depth; i += 1) {
    const next = CLAIM_STATUS_TRANSITIONS[path.at(-1)!];
    if (next.length === 0) break;
    path.push(pick(rand, next));
  }
  return path;
}

export async function seed(
  db: Database,
  options: { claimCount?: number; bcryptRounds?: number } = {},
) {
  const claimCount = options.claimCount ?? 1000;
  const rand = mulberry32(20_260_101);
  const passwordHash = await hashPassword(DEMO_PASSWORD, options.bcryptRounds ?? 10);

  await db.execute(
    sql`truncate table claim_status_events, claim_photos, claims, policies, push_tokens, refresh_tokens, users restart identity cascade`,
  );
  await db.execute(sql`alter sequence claim_reference_seq restart with 1001`);

  const insertedHolders = await db
    .insert(users)
    .values(POLICYHOLDERS.map((u) => ({ ...u, passwordHash, role: 'policyholder' as const })))
    .returning();
  const [assessor] = await db
    .insert(users)
    .values({
      email: DEMO_ASSESSOR_EMAIL,
      fullName: 'Ayanda Khumalo',
      passwordHash,
      role: 'assessor',
    })
    .returning();

  let sequence = 100_000;
  const policyRows = insertedHolders.flatMap((holder, index) => {
    const start = `202${3 + (index % 3)}-0${1 + (index % 9)}-01`;
    return [
      {
        userId: holder.id,
        type: 'motor_warranty' as const,
        number: `MW-${(sequence += 137)}`,
        status: 'active' as const,
        description: `Mechanical warranty: ${VEHICLES[index % VEHICLES.length]}`,
        coverAmountCents: 15_000_000,
        startDate: start,
      },
      {
        userId: holder.id,
        type: 'funeral' as const,
        number: `FN-${(sequence += 137)}`,
        status: 'active' as const,
        description: 'Family funeral cover: main member, spouse and 3 children',
        coverAmountCents: 3_000_000,
        startDate: start,
      },
      {
        userId: holder.id,
        type: 'legal' as const,
        number: `LG-${(sequence += 137)}`,
        status: index === 5 ? ('lapsed' as const) : ('active' as const),
        description: 'Legal plan: labour, consumer and motor matters',
        coverAmountCents: 7_500_000,
        startDate: start,
      },
    ];
  });
  const insertedPolicies = await db.insert(policies).values(policyRows).returning();
  const activePolicies = insertedPolicies.filter((p) => p.status === 'active');

  const now = Date.now();
  const claimRows: (typeof claims.$inferInsert)[] = [];
  const histories: ClaimStatus[][] = [];
  for (let i = 0; i < claimCount; i += 1) {
    const policy = pick(rand, activePolicies);
    const history = randomHistory(rand);
    const [min, max] = AMOUNT_RANGES[policy.type];
    const createdAt = new Date(now - Math.floor(rand() * 365 * 86_400_000));
    const incident = new Date(createdAt.getTime() - Math.floor(rand() * 10 * 86_400_000));
    histories.push(history);
    claimRows.push({
      policyId: policy.id,
      userId: policy.userId,
      // The seeded claimant is the main member, so funeral claims are for dependants.
      type:
        policy.type === 'funeral'
          ? ('death_of_dependant' as const)
          : pick(rand, CLAIM_TYPES_BY_POLICY[policy.type]),
      incidentDate: incident.toISOString().slice(0, 10),
      description: pick(rand, DESCRIPTIONS[policy.type]),
      amountCents: Math.round((min + rand() * (max - min)) / 100) * 100,
      status: history.at(-1)!,
      idempotencyKey: `seed-${i.toString().padStart(6, '0')}`,
      requestHash: 'seed',
      createdAt,
      updatedAt: createdAt,
    });
  }

  const insertedClaims: (typeof claims.$inferSelect)[] = [];
  for (let i = 0; i < claimRows.length; i += 250) {
    insertedClaims.push(
      ...(await db
        .insert(claims)
        .values(claimRows.slice(i, i + 250))
        .returning()),
    );
  }

  const events: (typeof claimStatusEvents.$inferInsert)[] = [];
  insertedClaims.forEach((claim, index) => {
    const history = histories[index]!;
    history.forEach((status, step) => {
      events.push({
        claimId: claim.id,
        fromStatus: step === 0 ? null : history[step - 1]!,
        toStatus: status,
        note: step === 0 ? null : pick(rand, ASSESSOR_NOTES[status] ?? ['Updated.']),
        actorId: step === 0 ? claim.userId : assessor!.id,
        createdAt: new Date(claim.createdAt.getTime() + step * 36 * 3_600_000),
      });
    });
  });
  for (let i = 0; i < events.length; i += 500) {
    await db.insert(claimStatusEvents).values(events.slice(i, i + 500));
  }

  return {
    users: insertedHolders.length + 1,
    policies: insertedPolicies.length,
    claims: insertedClaims.length,
  };
}

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntrypoint) {
  const config = loadConfig();
  const handle = createDatabase(config.DATABASE_URL, { ssl: config.DATABASE_SSL });
  seed(handle.db, { bcryptRounds: config.BCRYPT_ROUNDS })
    .then((result) => {
      console.log(
        `Seeded ${result.users} users, ${result.policies} policies, ${result.claims} claims`,
      );
      console.log(`Policyholder: ${DEMO_POLICYHOLDER_EMAIL} / ${DEMO_PASSWORD}`);
      console.log(`Assessor:     ${DEMO_ASSESSOR_EMAIL} / ${DEMO_PASSWORD}`);
    })
    .catch((error: unknown) => {
      console.error('Seed failed', error);
      process.exitCode = 1;
    })
    .finally(() => void handle.close());
}
