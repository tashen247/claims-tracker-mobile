CREATE SEQUENCE IF NOT EXISTS "claim_reference_seq" START WITH 1001;--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('submitted', 'in_review', 'more_info_needed', 'approved', 'rejected', 'paid');--> statement-breakpoint
CREATE TYPE "public"."claim_type" AS ENUM('mechanical_breakdown', 'electrical_fault', 'death_of_member', 'death_of_dependant', 'legal_consultation', 'legal_representation');--> statement-breakpoint
CREATE TYPE "public"."photo_content_type" AS ENUM('image/jpeg', 'image/png', 'image/heic');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('active', 'lapsed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."policy_type" AS ENUM('motor_warranty', 'funeral', 'legal');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('policyholder', 'assessor');--> statement-breakpoint
CREATE TABLE "claim_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"s3_key" varchar(300) NOT NULL,
	"content_type" "photo_content_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"from_status" "claim_status",
	"to_status" "claim_status" NOT NULL,
	"note" text,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(20) DEFAULT ('CLM-' || lpad(nextval('claim_reference_seq')::text, 6, '0')) NOT NULL,
	"policy_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "claim_type" NOT NULL,
	"incident_date" date NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" "claim_status" DEFAULT 'submitted' NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_amount_positive" CHECK ("claims"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "policy_type" NOT NULL,
	"number" varchar(32) NOT NULL,
	"status" "policy_status" DEFAULT 'active' NOT NULL,
	"description" varchar(200) NOT NULL,
	"cover_amount_cents" bigint NOT NULL,
	"start_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(200) NOT NULL,
	"platform" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"family_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'policyholder' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_photos" ADD CONSTRAINT "claim_photos_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_status_events" ADD CONSTRAINT "claim_status_events_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_status_events" ADD CONSTRAINT "claim_status_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_photos_claim_idx" ON "claim_photos" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_photos_key_unique" ON "claim_photos" USING btree ("s3_key");--> statement-breakpoint
CREATE INDEX "claim_status_events_claim_idx" ON "claim_status_events" USING btree ("claim_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_reference_unique" ON "claims" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_user_idempotency_key_unique" ON "claims" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "claims_user_created_idx" ON "claims" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "claims_status_created_idx" ON "claims" USING btree ("status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "claims_created_idx" ON "claims" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "policies_number_unique" ON "policies" USING btree ("number");--> statement-breakpoint
CREATE INDEX "policies_user_idx" ON "policies" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_token_unique" ON "push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_unique" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");