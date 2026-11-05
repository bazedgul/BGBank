GRANT SELECT ON public.accounts TO bg_bank_owner;
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
  INSERT INTO public.account_balance_projections(account_id,currency,ledger_balance_minor,available_balance_minor,last_posted_journal_id,projection_version)
  SELECT ac.id,ac.currency,coalesce(sum(CASE WHEN e.side=la.normal_side THEN e.amount_minor ELSE -e.amount_minor END),0),coalesce(sum(CASE WHEN e.side=la.normal_side THEN e.amount_minor ELSE -e.amount_minor END),0),p_journal_id,1
  FROM public.accounts ac JOIN public.ledger_accounts la ON la.id=ac.ledger_account_id AND la.currency=ac.currency JOIN public.journal_entries e ON e.ledger_account_id=la.id AND e.currency=la.currency AND e.journal_id=p_journal_id
  GROUP BY ac.id,ac.currency
  ON CONFLICT (account_id,currency) DO UPDATE SET ledger_balance_minor=excluded.ledger_balance_minor,available_balance_minor=excluded.available_balance_minor,last_posted_journal_id=excluded.last_posted_journal_id,projection_version=public.account_balance_projections.projection_version+1,updated_at=clock_timestamp();
END $$;
--> statement-breakpoint
ALTER FUNCTION public.post_journal(uuid,text,uuid,varchar,varchar) OWNER TO bg_bank_owner;
