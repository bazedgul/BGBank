ALTER TABLE public.customer_credentials OWNER TO bg_bank_owner;
ALTER TABLE public.customer_sessions OWNER TO bg_bank_owner;
ALTER TABLE public.transfers OWNER TO bg_bank_owner;
ALTER TABLE public.transfer_state_history OWNER TO bg_bank_owner;
ALTER TABLE public.idempotency_keys OWNER TO bg_bank_owner;
REVOKE ALL ON public.customer_credentials, public.customer_sessions, public.transfers, public.transfer_state_history, public.idempotency_keys FROM PUBLIC;
GRANT SELECT ON public.transfers, public.transfer_state_history TO bg_bank_runtime;

CREATE OR REPLACE FUNCTION public.execute_internal_transfer(
  p_actor_user_id uuid, p_source_account_id uuid, p_destination_account_id uuid,
  p_amount_minor bigint, p_currency varchar, p_reference varchar,
  p_idempotency_key varchar, p_request_hash varchar, p_request_id varchar
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_customer_id uuid; v_source_currency varchar(3); v_destination_currency varchar(3);
  v_source_ledger uuid; v_destination_ledger uuid; v_source_status text; v_destination_status text;
  v_balance bigint; v_canonical text; v_hash text; v_transfer_id uuid; v_journal_id uuid;
  v_existing_hash varchar(64); v_existing_state varchar(16); v_existing_response jsonb; v_result jsonb;
BEGIN
  IF session_user <> 'bg_bank_app' OR current_user <> 'bg_bank_owner' THEN
    RAISE EXCEPTION 'transfer connection identity rejected' USING ERRCODE = '42501';
  END IF;
  IF p_actor_user_id IS NULL OR p_source_account_id IS NULL OR p_destination_account_id IS NULL
     OR p_amount_minor IS NULL OR p_amount_minor <= 0 OR p_currency IS NULL
     OR p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0
     OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$'
     OR p_request_id IS NULL OR length(trim(p_request_id)) = 0 THEN
    RAISE EXCEPTION 'invalid transfer request' USING ERRCODE = '22023';
  END IF;
  IF p_source_account_id = p_destination_account_id THEN
    RAISE EXCEPTION 'self transfer is not allowed' USING ERRCODE = '22023';
  END IF;
  IF length(trim(p_idempotency_key)) > 255 OR length(trim(p_request_id)) > 200
     OR length(trim(p_currency)) <> 3 OR length(coalesce(p_reference, '')) > 200 THEN
    RAISE EXCEPTION 'transfer request exceeds limits' USING ERRCODE = '22023';
  END IF;
  p_currency := upper(trim(p_currency)); p_reference := nullif(trim(p_reference), '');
  p_idempotency_key := trim(p_idempotency_key);
  v_canonical := '{"amountMinor":' || to_json(p_amount_minor::text)::text
    || ',"currency":' || to_json(p_currency)::text
    || ',"destinationAccountId":' || to_json(p_destination_account_id::text)::text
    || ',"reference":' || coalesce(to_json(p_reference)::text, 'null')
    || ',"sourceAccountId":' || to_json(p_source_account_id::text)::text || '}';
  v_hash := encode(sha256(convert_to(v_canonical, 'UTF8')), 'hex');
  IF v_hash <> p_request_hash THEN RAISE EXCEPTION 'idempotency request hash mismatch' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.idempotency_keys(scope, key, request_hash, state)
  VALUES ('customer-transfer', p_idempotency_key, v_hash, 'processing')
  ON CONFLICT (scope, key) DO NOTHING;
  SELECT request_hash, state, response_json INTO v_existing_hash, v_existing_state, v_existing_response
    FROM public.idempotency_keys WHERE scope = 'customer-transfer' AND key = p_idempotency_key FOR UPDATE;
  IF v_existing_hash <> v_hash THEN RAISE EXCEPTION 'idempotency key conflict' USING ERRCODE = '23505'; END IF;
  IF v_existing_state = 'completed' THEN RETURN v_existing_response; END IF;
  IF v_existing_state <> 'processing' THEN RAISE EXCEPTION 'idempotency key is not retryable' USING ERRCODE = '55000'; END IF;

  PERFORM 1 FROM public.accounts WHERE id IN (p_source_account_id, p_destination_account_id) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.accounts WHERE id IN (p_source_account_id, p_destination_account_id)) <> 2 THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT status, currency, ledger_account_id INTO v_source_status, v_source_currency, v_source_ledger
    FROM public.accounts WHERE id = p_source_account_id;
  SELECT status, currency, ledger_account_id INTO v_destination_status, v_destination_currency, v_destination_ledger
    FROM public.accounts WHERE id = p_destination_account_id;
  IF v_source_status <> 'active' OR v_destination_status <> 'active' THEN RAISE EXCEPTION 'account is not eligible' USING ERRCODE = '42501'; END IF;
  IF v_source_currency <> p_currency OR v_destination_currency <> p_currency OR v_source_currency <> v_destination_currency THEN
    RAISE EXCEPTION 'currency mismatch' USING ERRCODE = '22023';
  END IF;
  SELECT c.id INTO v_customer_id FROM public.customers c JOIN public.users u ON u.id = c.user_id
    WHERE c.user_id = p_actor_user_id AND u.status = 'active';
  IF v_customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.account_owners WHERE account_id = p_source_account_id AND customer_id = v_customer_id)
     OR NOT EXISTS (SELECT 1 FROM public.account_owners WHERE account_id = p_destination_account_id AND customer_id = v_customer_id) THEN
    RAISE EXCEPTION 'account ownership rejected' USING ERRCODE = '42501';
  END IF;
  SELECT available_balance_minor INTO v_balance FROM public.account_balance_projections
    WHERE account_id = p_source_account_id AND currency = p_currency FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount_minor THEN RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.transfers(actor_user_id, source_account_id, destination_account_id, amount_minor, currency, state, reference)
  VALUES (p_actor_user_id, p_source_account_id, p_destination_account_id, p_amount_minor, p_currency, 'created', p_reference) RETURNING id INTO v_transfer_id;
  INSERT INTO public.transfer_state_history(transfer_id, from_state, to_state, actor_user_id, reason, request_id)
  VALUES (v_transfer_id, NULL, 'created', p_actor_user_id, 'transfer created', p_request_id);
  v_journal_id := public.create_draft_journal('internal_transfer', 'transfer:' || v_transfer_id, p_actor_user_id, 'human', NULL, p_request_id);
  PERFORM public.add_draft_journal_entry(v_journal_id, v_source_ledger, 'debit', p_amount_minor, p_currency, 1);
  PERFORM public.add_draft_journal_entry(v_journal_id, v_destination_ledger, 'credit', p_amount_minor, p_currency, 2);
  PERFORM public.post_journal(v_journal_id, 'human', p_actor_user_id, NULL, p_request_id);
  UPDATE public.transfers SET state = 'posted', journal_id = v_journal_id, posted_at = clock_timestamp() WHERE id = v_transfer_id;
  INSERT INTO public.transfer_state_history(transfer_id, from_state, to_state, actor_user_id, reason, request_id)
  VALUES (v_transfer_id, 'created', 'posted', p_actor_user_id, 'transfer posted', p_request_id);
  UPDATE public.transfers SET state = 'completed', completed_at = clock_timestamp() WHERE id = v_transfer_id;
  INSERT INTO public.transfer_state_history(transfer_id, from_state, to_state, actor_user_id, reason, request_id)
  VALUES (v_transfer_id, 'posted', 'completed', p_actor_user_id, 'transfer completed', p_request_id);
  v_result := jsonb_build_object('transferId', v_transfer_id, 'state', 'completed', 'journalId', v_journal_id, 'amountMinor', p_amount_minor::text, 'currency', p_currency);
  INSERT INTO public.audit_events(actor_type, actor_user_id, action, target_type, target_id, request_id, metadata)
  VALUES ('human', p_actor_user_id, 'transfer.completed', 'transfer', v_transfer_id, p_request_id, jsonb_build_object('amountMinor', p_amount_minor::text, 'currency', p_currency));
  INSERT INTO public.outbox_events(event_type, aggregate_type, aggregate_id, payload)
  VALUES ('transfer.completed', 'transfer', v_transfer_id, v_result);
  UPDATE public.idempotency_keys SET state = 'completed', transfer_id = v_transfer_id, response_json = v_result, terminal_at = clock_timestamp()
    WHERE scope = 'customer-transfer' AND key = p_idempotency_key;
  RETURN v_result;
END; $$;
--> statement-breakpoint
ALTER FUNCTION public.execute_internal_transfer(uuid, uuid, uuid, bigint, varchar, varchar, varchar, varchar, varchar) OWNER TO bg_bank_owner;
REVOKE ALL ON FUNCTION public.execute_internal_transfer(uuid, uuid, uuid, bigint, varchar, varchar, varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_internal_transfer(uuid, uuid, uuid, bigint, varchar, varchar, varchar, varchar, varchar) TO bg_bank_runtime;
