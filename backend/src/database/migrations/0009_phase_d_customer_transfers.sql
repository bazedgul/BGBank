CREATE TABLE "customer_credentials" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id"),
  "login_identifier" varchar(320) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "password_algorithm" varchar(32) NOT NULL DEFAULT 'argon2id',
  "failed_attempts" integer NOT NULL DEFAULT 0,
  "locked_until" timestamp with time zone,
  "password_changed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "customer_credentials_algorithm_check" CHECK ("password_algorithm" = 'argon2id'),
  CONSTRAINT "customer_credentials_identifier_check" CHECK (length(trim("login_identifier")) > 0)
);
--> statement-breakpoint
CREATE TABLE "customer_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "session_class" varchar(16) NOT NULL DEFAULT 'customer',
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "csrf_token_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "idle_expires_at" timestamp with time zone NOT NULL,
  "absolute_expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "user_agent" varchar(512),
  "created_ip" inet,
  CONSTRAINT "customer_sessions_class_check" CHECK ("session_class" = 'customer'),
  CONSTRAINT "customer_sessions_expiry_check" CHECK ("absolute_expires_at" > "created_at"),
  CONSTRAINT "customer_sessions_token_hash_check" CHECK (length("token_hash") = 64),
  CONSTRAINT "customer_sessions_csrf_hash_check" CHECK (length("csrf_token_hash") = 64)
);
--> statement-breakpoint
CREATE INDEX "customer_sessions_user_active_idx" ON "customer_sessions" ("user_id", "revoked_at", "absolute_expires_at");
--> statement-breakpoint
CREATE TABLE "transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "source_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "destination_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "amount_minor" bigint NOT NULL,
  "currency" varchar(3) NOT NULL REFERENCES "currencies"("code"),
  "state" varchar(16) NOT NULL DEFAULT 'created',
  "journal_id" uuid REFERENCES "journals"("id"),
  "reference" varchar(200),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "posted_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  CONSTRAINT "transfers_amount_positive_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "transfers_distinct_accounts_check" CHECK ("source_account_id" <> "destination_account_id"),
  CONSTRAINT "transfers_state_check" CHECK ("state" IN ('created', 'posted', 'completed', 'rejected')),
  CONSTRAINT "transfers_state_journal_check" CHECK (("state" IN ('created', 'rejected') AND "journal_id" IS NULL AND "posted_at" IS NULL AND "completed_at" IS NULL) OR ("state" = 'posted' AND "journal_id" IS NOT NULL AND "posted_at" IS NOT NULL AND "completed_at" IS NULL) OR ("state" = 'completed' AND "journal_id" IS NOT NULL AND "posted_at" IS NOT NULL AND "completed_at" IS NOT NULL)),
  CONSTRAINT "transfers_currency_source_fk" FOREIGN KEY ("source_account_id", "currency") REFERENCES "accounts" ("id", "currency"),
  CONSTRAINT "transfers_currency_destination_fk" FOREIGN KEY ("destination_account_id", "currency") REFERENCES "accounts" ("id", "currency")
);
--> statement-breakpoint
CREATE INDEX "transfers_actor_created_idx" ON "transfers" ("actor_user_id", "created_at", "id");
CREATE INDEX "transfers_source_created_idx" ON "transfers" ("source_account_id", "created_at", "id");
CREATE INDEX "transfers_destination_created_idx" ON "transfers" ("destination_account_id", "created_at", "id");
--> statement-breakpoint
CREATE TABLE "transfer_state_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "transfer_id" uuid NOT NULL REFERENCES "transfers"("id"),
  "from_state" varchar(16),
  "to_state" varchar(16) NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id"),
  "reason" varchar(200) NOT NULL,
  "request_id" varchar(200) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "transfer_state_history_transfer_idx" ON "transfer_state_history" ("transfer_id", "created_at", "id");
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scope" varchar(100) NOT NULL,
  "key" varchar(255) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "state" varchar(16) NOT NULL DEFAULT 'processing',
  "transfer_id" uuid REFERENCES "transfers"("id"),
  "response_json" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "terminal_at" timestamp with time zone,
  "tombstone_until" timestamp with time zone,
  CONSTRAINT "idempotency_keys_scope_key_unique" UNIQUE ("scope", "key"),
  CONSTRAINT "idempotency_keys_hash_check" CHECK (length("request_hash") = 64),
  CONSTRAINT "idempotency_keys_state_check" CHECK ("state" IN ('processing', 'completed', 'rejected', 'tombstone')),
  CONSTRAINT "idempotency_keys_terminal_consistency_check" CHECK (("state" = 'processing' AND "terminal_at" IS NULL) OR ("state" IN ('completed', 'rejected', 'tombstone') AND "terminal_at" IS NOT NULL)),
  CONSTRAINT "idempotency_keys_completed_result_check" CHECK (("state" = 'completed' AND "transfer_id" IS NOT NULL AND "response_json" IS NOT NULL) OR "state" <> 'completed')
);
--> statement-breakpoint
CREATE INDEX "idempotency_keys_cleanup_idx" ON "idempotency_keys" ("tombstone_until");
