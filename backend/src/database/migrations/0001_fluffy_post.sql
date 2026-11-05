CREATE TABLE "account_balance_projections" (
	"account_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"ledger_balance_minor" bigint NOT NULL,
	"available_balance_minor" bigint NOT NULL,
	"last_posted_journal_id" uuid,
	"projection_version" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_balance_projections_account_id_currency_pk" PRIMARY KEY("account_id","currency"),
	CONSTRAINT "account_projections_available_balance_check" CHECK ("account_balance_projections"."available_balance_minor" = "account_balance_projections"."ledger_balance_minor")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"actor_reference" varchar(200),
	"action" varchar(100) NOT NULL,
	"target_type" varchar(100) NOT NULL,
	"target_id" uuid,
	"request_id" varchar(200) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"side" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"entry_position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_side_check" CHECK ("journal_entries"."side" IN ('debit', 'credit')),
	CONSTRAINT "journal_entries_amount_positive_check" CHECK ("journal_entries"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "journal_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"actor_reference" varchar(200),
	"reason" text NOT NULL,
	"request_id" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"business_reference" varchar(200) NOT NULL,
	"reverses_journal_id" uuid,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "journals_status_check" CHECK ("journals"."status" IN ('draft', 'posted', 'abandoned', 'expired')),
	CONSTRAINT "journals_posted_at_consistency_check" CHECK (("journals"."status" = 'posted' AND "journals"."posted_at" IS NOT NULL) OR ("journals"."status" <> 'posted' AND "journals"."posted_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(150) NOT NULL,
	"aggregate_type" varchar(100) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"worker_id" varchar(200),
	"claim_token" uuid,
	"published_at" timestamp with time zone,
	"last_error_code" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_balance_projections" ADD CONSTRAINT "account_balance_projections_last_posted_journal_id_journals_id_fk" FOREIGN KEY ("last_posted_journal_id") REFERENCES "public"."journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balance_projections" ADD CONSTRAINT "account_projections_account_currency_fk" FOREIGN KEY ("account_id","currency") REFERENCES "public"."accounts"("id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_ledger_account_currency_fk" FOREIGN KEY ("ledger_account_id","currency") REFERENCES "public"."ledger_accounts"("id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_status_history" ADD CONSTRAINT "journal_status_history_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_status_history" ADD CONSTRAINT "journal_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_reverses_journal_fk" FOREIGN KEY ("reverses_journal_id") REFERENCES "public"."journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_journal_position_unique" ON "journal_entries" USING btree ("journal_id","entry_position");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bg_bank_owner') THEN CREATE ROLE bg_bank_owner NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bg_bank_migrator') THEN CREATE ROLE bg_bank_migrator LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bg_bank_runtime') THEN CREATE ROLE bg_bank_runtime NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bg_bank_app') THEN CREATE ROLE bg_bank_app LOGIN IN ROLE bg_bank_runtime; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bg_bank_posting') THEN CREATE ROLE bg_bank_posting NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bg_bank_posting_service') THEN CREATE ROLE bg_bank_posting_service LOGIN IN ROLE bg_bank_posting; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bg_bank_readonly') THEN CREATE ROLE bg_bank_readonly NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bg_bank_reconcile') THEN CREATE ROLE bg_bank_reconcile LOGIN IN ROLE bg_bank_readonly; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bg_bank_test') THEN CREATE ROLE bg_bank_test LOGIN; END IF;
END $$;
--> statement-breakpoint
GRANT bg_bank_owner TO bg_bank_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
ALTER TABLE public.journals OWNER TO bg_bank_owner;
ALTER TABLE public.journal_entries OWNER TO bg_bank_owner;
ALTER TABLE public.journal_status_history OWNER TO bg_bank_owner;
ALTER TABLE public.account_balance_projections OWNER TO bg_bank_owner;
ALTER TABLE public.audit_events OWNER TO bg_bank_owner;
ALTER TABLE public.outbox_events OWNER TO bg_bank_owner;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO bg_bank_runtime, bg_bank_posting, bg_bank_readonly;
GRANT SELECT ON public.currencies, public.users, public.customers, public.ledger_accounts, public.accounts, public.account_owners, public.journals, public.journal_entries, public.journal_status_history, public.account_balance_projections, public.audit_events, public.outbox_events TO bg_bank_runtime;
GRANT SELECT ON public.currencies, public.users, public.customers, public.ledger_accounts, public.accounts, public.account_owners, public.journals, public.journal_entries, public.journal_status_history, public.account_balance_projections, public.audit_events, public.outbox_events TO bg_bank_readonly;
GRANT SELECT, INSERT, UPDATE ON public.ledger_accounts TO bg_bank_owner;
GRANT SELECT, INSERT, UPDATE ON public.journals, public.journal_entries, public.journal_status_history, public.account_balance_projections, public.audit_events, public.outbox_events TO bg_bank_owner;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.create_ledger_account(p_code varchar, p_name varchar, p_account_type text, p_normal_side text, p_parent_id uuid, p_currency varchar, p_kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid; v_parent_kind text;
BEGIN
  IF p_parent_id IS NOT NULL THEN
    SELECT kind INTO v_parent_kind FROM public.ledger_accounts WHERE id = p_parent_id AND currency = p_currency FOR UPDATE;
    IF v_parent_kind IS NULL OR v_parent_kind <> 'control' THEN RAISE EXCEPTION 'invalid ledger parent'; END IF;
  END IF;
  IF p_code IS NULL OR length(trim(p_code)) = 0 OR p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'ledger code and name are required'; END IF;
  INSERT INTO public.ledger_accounts(code,name,account_type,normal_side,parent_id,currency,kind) VALUES (p_code,p_name,p_account_type,p_normal_side,p_parent_id,p_currency,p_kind) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.create_draft_journal(p_journal_type text, p_business_reference varchar, p_created_by uuid, p_actor_type text, p_actor_reference varchar, p_request_id varchar)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_type NOT IN ('human','system') OR (p_actor_type='human' AND p_created_by IS NULL) OR (p_actor_type='system' AND (p_created_by IS NOT NULL OR coalesce(trim(p_actor_reference),'')='')) THEN RAISE EXCEPTION 'invalid actor'; END IF;
  INSERT INTO public.journals(journal_type,business_reference,created_by) VALUES (p_journal_type,p_business_reference,p_created_by) RETURNING id INTO v_id;
  INSERT INTO public.journal_status_history(journal_id,from_status,to_status,actor_type,actor_user_id,actor_reference,reason,request_id) VALUES (v_id,NULL,'draft',p_actor_type,p_created_by,p_actor_reference,'draft created',p_request_id);
  RETURN v_id;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.add_draft_journal_entry(p_journal_id uuid, p_ledger_account_id uuid, p_side text, p_amount_minor bigint, p_currency varchar, p_entry_position integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid; v_status text; v_kind text;
BEGIN
  SELECT status INTO v_status FROM public.journals WHERE id=p_journal_id FOR UPDATE;
  SELECT kind INTO v_kind FROM public.ledger_accounts WHERE id=p_ledger_account_id AND currency=p_currency;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'journal is not draft'; END IF;
  IF v_kind IS NULL OR v_kind = 'control' THEN RAISE EXCEPTION 'invalid posting account'; END IF;
  INSERT INTO public.journal_entries(journal_id,ledger_account_id,side,amount_minor,currency,entry_position) VALUES (p_journal_id,p_ledger_account_id,p_side,p_amount_minor,p_currency,p_entry_position) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.validate_posted_journal(p_journal_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.journal_entries WHERE journal_id=p_journal_id;
  IF v_count < 2 THEN RAISE EXCEPTION 'posted journal requires at least two entries'; END IF;
  SELECT count(*) INTO v_bad FROM (SELECT currency FROM public.journal_entries WHERE journal_id=p_journal_id GROUP BY currency HAVING sum(CASE WHEN side='debit' THEN amount_minor ELSE 0 END) <> sum(CASE WHEN side='credit' THEN amount_minor ELSE 0 END)) x;
  IF v_bad > 0 THEN RAISE EXCEPTION 'journal is not balanced per currency'; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries e JOIN public.ledger_accounts a ON a.id=e.ledger_account_id WHERE e.journal_id=p_journal_id AND (a.kind='control' OR a.status <> 'active' OR a.currency <> e.currency)) THEN RAISE EXCEPTION 'invalid ledger account in journal'; END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.post_journal(p_journal_id uuid, p_actor_type text, p_actor_user_id uuid, p_actor_reference varchar, p_request_id varchar)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.journals WHERE id=p_journal_id FOR UPDATE;
  IF v_status IS NULL OR v_status <> 'draft' THEN RAISE EXCEPTION 'journal is not an unposted draft'; END IF;
  PERFORM public.validate_posted_journal(p_journal_id);
  IF p_actor_type NOT IN ('human','system') OR (p_actor_type='human' AND p_actor_user_id IS NULL) OR (p_actor_type='system' AND (p_actor_user_id IS NOT NULL OR coalesce(trim(p_actor_reference),'')='')) THEN RAISE EXCEPTION 'invalid actor'; END IF;
  UPDATE public.journals SET status='posted', posted_at=clock_timestamp() WHERE id=p_journal_id;
  INSERT INTO public.journal_status_history(journal_id,from_status,to_status,actor_type,actor_user_id,actor_reference,reason,request_id) VALUES (p_journal_id,'draft','posted',p_actor_type,p_actor_user_id,p_actor_reference,'journal posted',p_request_id);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reverse_journal(p_original_journal_id uuid, p_actor_type text, p_actor_user_id uuid, p_actor_reference varchar, p_request_id varchar)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_new uuid; v_status text; r record; v_position integer := 1;
BEGIN
  SELECT status INTO v_status FROM public.journals WHERE id=p_original_journal_id FOR UPDATE;
  IF v_status <> 'posted' THEN RAISE EXCEPTION 'only posted journals can be reversed'; END IF;
  IF EXISTS (SELECT 1 FROM public.journals WHERE reverses_journal_id=p_original_journal_id) THEN RAISE EXCEPTION 'journal already reversed'; END IF;
  INSERT INTO public.journals(journal_type,status,business_reference,reverses_journal_id,posted_at,created_by) VALUES ('reversal','posted','reversal:'||p_original_journal_id,p_original_journal_id,clock_timestamp(),p_actor_user_id) RETURNING id INTO v_new;
  FOR r IN SELECT ledger_account_id,side,amount_minor,currency FROM public.journal_entries WHERE journal_id=p_original_journal_id ORDER BY entry_position LOOP
    INSERT INTO public.journal_entries(journal_id,ledger_account_id,side,amount_minor,currency,entry_position) VALUES (v_new,r.ledger_account_id,CASE WHEN r.side='debit' THEN 'credit' ELSE 'debit' END,r.amount_minor,r.currency,v_position); v_position := v_position + 1;
  END LOOP;
  PERFORM public.validate_posted_journal(v_new);
  INSERT INTO public.journal_status_history(journal_id,from_status,to_status,actor_type,actor_user_id,actor_reference,reason,request_id) VALUES (v_new,NULL,'posted',p_actor_type,p_actor_user_id,p_actor_reference,'journal reversal posted',p_request_id);
  RETURN v_new;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.initialize_balance_projection(p_account_id uuid, p_currency varchar)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.account_balance_projections(account_id,currency,ledger_balance_minor,available_balance_minor) VALUES (p_account_id,p_currency,0,0) ON CONFLICT (account_id,currency) DO NOTHING;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.repair_balance_projection(p_account_id uuid, p_currency varchar)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_ledger bigint := 0; v_last uuid;
BEGIN
  SELECT coalesce(sum(CASE WHEN e.side=a.normal_side THEN e.amount_minor ELSE -e.amount_minor END),0), max(e.journal_id) INTO v_ledger, v_last FROM public.accounts ac JOIN public.ledger_accounts a ON a.id=ac.ledger_account_id AND a.currency=ac.currency LEFT JOIN public.journal_entries e ON e.ledger_account_id=a.id AND e.currency=a.currency LEFT JOIN public.journals j ON j.id=e.journal_id AND j.status='posted' WHERE ac.id=p_account_id AND ac.currency=p_currency;
  INSERT INTO public.account_balance_projections(account_id,currency,ledger_balance_minor,available_balance_minor,last_posted_journal_id,projection_version) VALUES (p_account_id,p_currency,v_ledger,v_ledger,v_last,1) ON CONFLICT (account_id,currency) DO UPDATE SET ledger_balance_minor=excluded.ledger_balance_minor,available_balance_minor=excluded.available_balance_minor,last_posted_journal_id=excluded.last_posted_journal_id,projection_version=public.account_balance_projections.projection_version+1,updated_at=clock_timestamp();
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_posted_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF (TG_TABLE_NAME='journals' AND OLD.status='posted') OR TG_TABLE_NAME='journal_entries' THEN RAISE EXCEPTION 'posted financial records are immutable'; END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER journals_posted_immutable BEFORE UPDATE OR DELETE ON public.journals FOR EACH ROW EXECUTE FUNCTION public.reject_posted_mutation();
CREATE TRIGGER journal_entries_immutable BEFORE UPDATE OR DELETE ON public.journal_entries FOR EACH ROW WHEN (OLD.journal_id IS NOT NULL) EXECUTE FUNCTION public.reject_posted_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.deferred_journal_balance_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN IF (SELECT status FROM public.journals WHERE id=NEW.id)='posted' THEN PERFORM public.validate_posted_journal(NEW.id); END IF; RETURN NEW; END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journals_balance_deferred AFTER INSERT OR UPDATE ON public.journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.status='posted') EXECUTE FUNCTION public.deferred_journal_balance_check();
--> statement-breakpoint
ALTER FUNCTION public.create_ledger_account(varchar,varchar,text,text,uuid,varchar,text) OWNER TO bg_bank_owner;
ALTER FUNCTION public.create_draft_journal(text,varchar,uuid,text,varchar,varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.add_draft_journal_entry(uuid,uuid,text,bigint,varchar,integer) OWNER TO bg_bank_owner;
ALTER FUNCTION public.validate_posted_journal(uuid) OWNER TO bg_bank_owner;
ALTER FUNCTION public.post_journal(uuid,text,uuid,varchar,varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.reverse_journal(uuid,text,uuid,varchar,varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.initialize_balance_projection(uuid,varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.repair_balance_projection(uuid,varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.reject_posted_mutation() OWNER TO bg_bank_owner;
ALTER FUNCTION public.deferred_journal_balance_check() OWNER TO bg_bank_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_ledger_account(varchar,varchar,text,text,uuid,varchar,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_draft_journal(text,varchar,uuid,text,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_draft_journal_entry(uuid,uuid,text,bigint,varchar,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal(uuid,text,uuid,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_journal(uuid,text,uuid,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.initialize_balance_projection(uuid,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repair_balance_projection(uuid,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ledger_account(varchar,varchar,text,text,uuid,varchar,text) TO bg_bank_runtime;
GRANT EXECUTE ON FUNCTION public.create_draft_journal(text,varchar,uuid,text,varchar,varchar) TO bg_bank_runtime;
GRANT EXECUTE ON FUNCTION public.add_draft_journal_entry(uuid,uuid,text,bigint,varchar,integer) TO bg_bank_runtime;
GRANT EXECUTE ON FUNCTION public.post_journal(uuid,text,uuid,varchar,varchar) TO bg_bank_posting;
GRANT EXECUTE ON FUNCTION public.reverse_journal(uuid,text,uuid,varchar,varchar) TO bg_bank_posting;
GRANT EXECUTE ON FUNCTION public.initialize_balance_projection(uuid,varchar) TO bg_bank_runtime;
GRANT EXECUTE ON FUNCTION public.repair_balance_projection(uuid,varchar) TO bg_bank_readonly;
