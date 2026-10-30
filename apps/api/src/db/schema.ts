import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  CLAIM_STATUSES,
  CLAIM_TYPES,
  PHOTO_CONTENT_TYPES,
  POLICY_STATUSES,
  POLICY_TYPES,
  ROLES,
} from '@claims/shared';

export const roleEnum = pgEnum('user_role', ROLES);
export const policyTypeEnum = pgEnum('policy_type', POLICY_TYPES);
export const policyStatusEnum = pgEnum('policy_status', POLICY_STATUSES);
export const claimTypeEnum = pgEnum('claim_type', CLAIM_TYPES);
export const claimStatusEnum = pgEnum('claim_status', CLAIM_STATUSES);
export const photoContentTypeEnum = pgEnum('photo_content_type', PHOTO_CONTENT_TYPES);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 254 }).notNull(),
    fullName: varchar('full_name', { length: 120 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull().default('policyholder'),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    familyId: uuid('family_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_unique').on(t.tokenHash),
    index('refresh_tokens_family_idx').on(t.familyId),
  ],
);

export const policies = pgTable(
  'policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: policyTypeEnum('type').notNull(),
    number: varchar('number', { length: 32 }).notNull(),
    status: policyStatusEnum('status').notNull().default('active'),
    description: varchar('description', { length: 200 }).notNull(),
    coverAmountCents: bigint('cover_amount_cents', { mode: 'number' }).notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('policies_number_unique').on(t.number),
    index('policies_user_idx').on(t.userId),
  ],
);

export const claims = pgTable(
  'claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: varchar('reference', { length: 20 })
      .notNull()
      .default(sql`('CLM-' || lpad(nextval('claim_reference_seq')::text, 6, '0'))`),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => policies.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    type: claimTypeEnum('type').notNull(),
    incidentDate: date('incident_date', { mode: 'string' }).notNull(),
    description: text('description').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    status: claimStatusEnum('status').notNull().default('submitted'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    ...timestamps,
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('claims_reference_unique').on(t.reference),
    // Keys are scoped per user so one customer's key can never return another customer's claim.
    uniqueIndex('claims_user_idempotency_key_unique').on(t.userId, t.idempotencyKey),
    index('claims_user_created_idx').on(t.userId, t.createdAt.desc(), t.id.desc()),
    index('claims_status_created_idx').on(t.status, t.createdAt.desc(), t.id.desc()),
    index('claims_created_idx').on(t.createdAt.desc(), t.id.desc()),
    check('claims_amount_positive', sql`${t.amountCents} > 0`),
  ],
);

export const claimPhotos = pgTable(
  'claim_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claims.id, { onDelete: 'cascade' }),
    s3Key: varchar('s3_key', { length: 300 }).notNull(),
    contentType: photoContentTypeEnum('content_type').notNull(),
    ...timestamps,
  },
  (t) => [
    index('claim_photos_claim_idx').on(t.claimId),
    uniqueIndex('claim_photos_key_unique').on(t.s3Key),
  ],
);

export const claimStatusEvents = pgTable(
  'claim_status_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claims.id, { onDelete: 'cascade' }),
    fromStatus: claimStatusEnum('from_status'),
    toStatus: claimStatusEnum('to_status').notNull(),
    note: text('note'),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [index('claim_status_events_claim_idx').on(t.claimId, t.createdAt)],
);

export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 200 }).notNull(),
    platform: varchar('platform', { length: 10 }).notNull(),
    ...timestamps,
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('push_tokens_token_unique').on(t.token),
    index('push_tokens_user_idx').on(t.userId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type PolicyRow = typeof policies.$inferSelect;
export type ClaimRow = typeof claims.$inferSelect;
export type ClaimPhotoRow = typeof claimPhotos.$inferSelect;
export type ClaimStatusEventRow = typeof claimStatusEvents.$inferSelect;
