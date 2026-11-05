CREATE OR REPLACE FUNCTION public.change_account_status(p_account_id uuid, p_to_status text, p_actor_user_id uuid, p_reason text, p_request_id varchar)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_current text;
  v_user_status text;
  v_primary_count integer;
  v_ledger_kind text;
  v_ledger_balance bigint;
  v_last_activity timestamptz;
  v_allowed boolean := false;
BEGIN
  IF p_actor_user_id IS NULL OR coalesce(trim(p_reason), '') = '' OR coalesce(trim(p_request_id), '') = '' THEN
    RAISE EXCEPTION 'authenticated human actor, reason and request id are required';
  END IF;
  SELECT status INTO v_user_status FROM public.users WHERE id = p_actor_user_id;
  IF v_user_status <> 'active' THEN RAISE EXCEPTION 'actor is not an active user'; END IF;

  SELECT status INTO v_current FROM public.accounts WHERE id = p_account_id FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'account not found'; END IF;
  IF v_current = 'pending' AND p_to_status = 'active' THEN v_allowed := true;
  ELSIF v_current = 'active' AND p_to_status IN ('frozen','dormant','closed') THEN v_allowed := true;
  ELSIF v_current = 'frozen' AND p_to_status IN ('active','closed') THEN v_allowed := true;
  ELSIF v_current = 'dormant' AND p_to_status IN ('active','closed') THEN v_allowed := true;
  END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'invalid account status transition: % -> %', v_current, p_to_status; END IF;

  IF p_to_status = 'active' THEN
    SELECT count(*) INTO v_primary_count FROM public.account_owners WHERE account_id = p_account_id AND role = 'primary';
    IF v_primary_count <> 1 THEN RAISE EXCEPTION 'account activation requires exactly one primary owner'; END IF;
    SELECT la.kind INTO v_ledger_kind FROM public.accounts a JOIN public.ledger_accounts la ON la.id = a.ledger_account_id AND la.currency = a.currency WHERE a.id = p_account_id;
    IF v_ledger_kind <> 'customer_subledger' THEN RAISE EXCEPTION 'account is not linked to a customer sub-ledger'; END IF;
  END IF;

  IF p_to_status = 'dormant' THEN
    SELECT max(j.created_at) INTO v_last_activity
    FROM public.accounts a
    JOIN public.ledger_accounts la ON la.id = a.ledger_account_id AND la.currency = a.currency
    JOIN public.journal_entries je ON je.ledger_account_id = la.id AND je.currency = la.currency
    JOIN public.journals j ON j.id = je.journal_id AND j.status = 'posted'
    WHERE a.id = p_account_id;
    IF v_last_activity IS NULL THEN RAISE EXCEPTION 'no qualifying account activity exists for dormancy'; END IF;
    IF v_last_activity > clock_timestamp() - interval '365 days' THEN RAISE EXCEPTION 'account has qualifying activity within the dormancy threshold'; END IF;
  END IF;

  IF p_to_status = 'closed' THEN
    SELECT coalesce(sum(CASE WHEN je.side = la.normal_side THEN je.amount_minor ELSE -je.amount_minor END), 0)
    INTO v_ledger_balance
    FROM public.accounts a
    JOIN public.ledger_accounts la ON la.id = a.ledger_account_id AND la.currency = a.currency
    LEFT JOIN public.journal_entries je ON je.ledger_account_id = la.id AND je.currency = la.currency
    LEFT JOIN public.journals j ON j.id = je.journal_id AND j.status = 'posted'
    WHERE a.id = p_account_id;
    IF v_ledger_balance <> 0 THEN RAISE EXCEPTION 'account cannot close with non-zero authoritative ledger balance'; END IF;
  END IF;

  UPDATE public.accounts SET status = p_to_status, closed_at = CASE WHEN p_to_status = 'closed' THEN clock_timestamp() ELSE NULL END, updated_at = clock_timestamp() WHERE id = p_account_id;
  INSERT INTO public.audit_events(actor_type, actor_user_id, action, target_type, target_id, request_id, metadata)
  VALUES ('human', p_actor_user_id, 'account.status_changed', 'account', p_account_id, p_request_id, jsonb_build_object('from_status', v_current, 'to_status', p_to_status, 'reason', p_reason));
  RETURN p_to_status;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.activate_account(p_account_id uuid, p_actor_user_id uuid, p_reason text, p_request_id varchar) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ SELECT public.change_account_status(p_account_id, 'active', p_actor_user_id, p_reason, p_request_id) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.freeze_account(p_account_id uuid, p_actor_user_id uuid, p_reason text, p_request_id varchar) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ SELECT public.change_account_status(p_account_id, 'frozen', p_actor_user_id, p_reason, p_request_id) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.unfreeze_account(p_account_id uuid, p_actor_user_id uuid, p_reason text, p_request_id varchar) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ SELECT public.change_account_status(p_account_id, 'active', p_actor_user_id, p_reason, p_request_id) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mark_account_dormant(p_account_id uuid, p_actor_user_id uuid, p_reason text, p_request_id varchar) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ SELECT public.change_account_status(p_account_id, 'dormant', p_actor_user_id, p_reason, p_request_id) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.close_account(p_account_id uuid, p_actor_user_id uuid, p_reason text, p_request_id varchar) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ SELECT public.change_account_status(p_account_id, 'closed', p_actor_user_id, p_reason, p_request_id) $$;
--> statement-breakpoint
ALTER FUNCTION public.change_account_status(uuid,text,uuid,text,varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.activate_account(uuid,uuid,text,varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.freeze_account(uuid,uuid,text,varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.unfreeze_account(uuid,uuid,text,varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.mark_account_dormant(uuid,uuid,text,varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.close_account(uuid,uuid,text,varchar) OWNER TO bg_bank_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.change_account_status(uuid,text,uuid,text,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_account(uuid,uuid,text,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.freeze_account(uuid,uuid,text,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unfreeze_account(uuid,uuid,text,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_account_dormant(uuid,uuid,text,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_account(uuid,uuid,text,varchar) FROM PUBLIC;
