SET LOCAL ROLE bg_bank_owner;
CREATE OR REPLACE FUNCTION public.reverse_journal(p_original_journal_id uuid, p_actor_type text, p_actor_user_id uuid, p_actor_reference varchar, p_request_id varchar)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_new uuid; v_status text; r record; v_position integer := 1;
BEGIN
  SELECT status INTO v_status FROM public.journals WHERE id=p_original_journal_id FOR UPDATE;
  IF v_status <> 'posted' THEN RAISE EXCEPTION 'only posted journals can be reversed'; END IF;
  IF p_actor_type IS NULL OR p_actor_type NOT IN ('human','system') OR (p_actor_type='human' AND p_actor_user_id IS NULL) OR (p_actor_type='system' AND (p_actor_user_id IS NOT NULL OR coalesce(trim(p_actor_reference),'')='')) THEN RAISE EXCEPTION 'invalid actor'; END IF;
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
    JOIN public.journal_entries je ON je.ledger_account_id = la.id AND je.currency = la.currency
    JOIN public.journals j ON j.id = je.journal_id AND j.status = 'posted'
    WHERE a.id = p_account_id;
    IF v_ledger_balance <> 0 THEN RAISE EXCEPTION 'account cannot close with non-zero authoritative ledger balance'; END IF;
  END IF;
  UPDATE public.accounts SET status = p_to_status, closed_at = CASE WHEN p_to_status = 'closed' THEN clock_timestamp() ELSE NULL END, updated_at = clock_timestamp() WHERE id = p_account_id;
  INSERT INTO public.audit_events(actor_type, actor_user_id, action, target_type, target_id, request_id, metadata)
  VALUES ('human', p_actor_user_id, 'account.status_changed', 'account', p_account_id, p_request_id, jsonb_build_object('from_status', v_current, 'to_status', p_to_status, 'reason', p_reason));
  RETURN p_to_status;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.repair_balance_projection(p_account_id uuid, p_currency varchar)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_ledger bigint := 0; v_last uuid;
BEGIN
  SELECT coalesce(sum(CASE WHEN e.side=a.normal_side THEN e.amount_minor ELSE -e.amount_minor END),0), max(e.journal_id)
  INTO v_ledger, v_last
  FROM public.accounts ac
  JOIN public.ledger_accounts a ON a.id=ac.ledger_account_id AND a.currency=ac.currency
  LEFT JOIN public.journal_entries e ON e.ledger_account_id=a.id AND e.currency=a.currency
  JOIN public.journals j ON j.id=e.journal_id AND j.status='posted'
  WHERE ac.id=p_account_id AND ac.currency=p_currency;
  INSERT INTO public.account_balance_projections(account_id,currency,ledger_balance_minor,available_balance_minor,last_posted_journal_id,projection_version)
  VALUES (p_account_id,p_currency,v_ledger,v_ledger,v_last,1)
  ON CONFLICT (account_id,currency) DO UPDATE SET ledger_balance_minor=excluded.ledger_balance_minor,available_balance_minor=excluded.available_balance_minor,last_posted_journal_id=excluded.last_posted_journal_id,projection_version=public.account_balance_projections.projection_version+1,updated_at=clock_timestamp();
END $$;
--> statement-breakpoint
ALTER FUNCTION public.reverse_journal(uuid,text,uuid,varchar,varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.change_account_status(uuid,text,uuid,text,varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.repair_balance_projection(uuid,varchar) OWNER TO bg_bank_owner;
RESET ROLE;
