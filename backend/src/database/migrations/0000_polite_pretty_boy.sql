CREATE TABLE "account_owners" (
	"account_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"role" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_owners_account_id_customer_id_pk" PRIMARY KEY("account_id","customer_id"),
	CONSTRAINT "account_owners_role_check" CHECK ("account_owners"."role" IN ('primary', 'joint'))
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_number" varchar(34) NOT NULL,
	"account_type" text NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "accounts_account_number_unique" UNIQUE("account_number"),
	CONSTRAINT "accounts_id_currency_unique" UNIQUE("id","currency"),
	CONSTRAINT "accounts_account_type_check" CHECK ("accounts"."account_type" IN ('current', 'savings')),
	CONSTRAINT "accounts_account_number_not_blank_check" CHECK (length(trim("accounts"."account_number")) > 0),
	CONSTRAINT "accounts_status_check" CHECK ("accounts"."status" IN ('pending', 'active', 'frozen', 'dormant', 'closed')),
	CONSTRAINT "accounts_closed_at_consistency_check" CHECK (("accounts"."status" = 'closed' AND "accounts"."closed_at" IS NOT NULL) OR ("accounts"."status" <> 'closed' AND "accounts"."closed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" varchar(3) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"minor_unit_exponent" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currencies_code_uppercase_format_check" CHECK ("currencies"."code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "currencies_minor_unit_exponent_check" CHECK ("currencies"."minor_unit_exponent" >= 0),
	CONSTRAINT "currencies_name_not_blank_check" CHECK (length(trim("currencies"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"preferred_language" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "customers_display_name_not_blank_check" CHECK (length(trim("customers"."display_name")) > 0),
	CONSTRAINT "customers_country_code_format_check" CHECK ("customers"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "customers_preferred_language_not_blank_check" CHECK (length(trim("customers"."preferred_language")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"account_type" text NOT NULL,
	"normal_side" text NOT NULL,
	"parent_id" uuid,
	"currency" varchar(3) NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_code_unique" UNIQUE("code"),
	CONSTRAINT "ledger_accounts_id_currency_unique" UNIQUE("id","currency"),
	CONSTRAINT "ledger_accounts_type_check" CHECK ("ledger_accounts"."account_type" IN ('asset', 'liability', 'equity', 'income', 'expense')),
	CONSTRAINT "ledger_accounts_normal_side_check" CHECK ("ledger_accounts"."normal_side" IN ('debit', 'credit')),
	CONSTRAINT "ledger_accounts_kind_check" CHECK ("ledger_accounts"."kind" IN ('control', 'customer_subledger', 'operational', 'clearing', 'suspense', 'income', 'expense')),
	CONSTRAINT "ledger_accounts_status_check" CHECK ("ledger_accounts"."status" IN ('active', 'closed')),
	CONSTRAINT "ledger_accounts_not_self_parent_check" CHECK ("ledger_accounts"."parent_id" IS NULL OR "ledger_accounts"."parent_id" <> "ledger_accounts"."id"),
	CONSTRAINT "ledger_accounts_code_not_blank_check" CHECK (length(trim("ledger_accounts"."code")) > 0),
	CONSTRAINT "ledger_accounts_name_not_blank_check" CHECK (length(trim("ledger_accounts"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "users_status_check" CHECK ("users"."status" IN ('pending', 'active', 'suspended', 'closed')),
	CONSTRAINT "users_closed_at_consistency_check" CHECK (("users"."status" = 'closed' AND "users"."closed_at" IS NOT NULL) OR ("users"."status" <> 'closed' AND "users"."closed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "account_owners" ADD CONSTRAINT "account_owners_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_owners" ADD CONSTRAINT "account_owners_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_ledger_account_currency_fk" FOREIGN KEY ("ledger_account_id","currency") REFERENCES "public"."ledger_accounts"("id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_parent_currency_fk" FOREIGN KEY ("parent_id","currency") REFERENCES "public"."ledger_accounts"("id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_owners_primary_unique" ON "account_owners" USING btree ("account_id") WHERE "account_owners"."role" = 'primary';--> statement-breakpoint
CREATE INDEX "account_owners_customer_id_idx" ON "account_owners" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_ledger_account_id_unique" ON "accounts" USING btree ("ledger_account_id");--> statement-breakpoint
CREATE INDEX "ledger_accounts_parent_id_idx" ON "ledger_accounts" USING btree ("parent_id");