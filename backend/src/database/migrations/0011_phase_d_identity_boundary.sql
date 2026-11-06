CREATE OR REPLACE FUNCTION public.identity_find_credential(p_identifier varchar)
RETURNS TABLE(user_id uuid, password_hash text, locked_until timestamptz, user_status text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT c.user_id, c.password_hash, c.locked_until, u.status
    FROM public.customer_credentials c JOIN public.users u ON u.id = c.user_id
   WHERE c.login_identifier = lower(trim(p_identifier))
$$;
CREATE OR REPLACE FUNCTION public.identity_record_failed_login(p_user_id uuid, p_now timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.customer_credentials
     SET failed_attempts = failed_attempts + 1,
         locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN p_now + interval '15 minutes' ELSE locked_until END,
         updated_at = clock_timestamp()
   WHERE user_id = p_user_id
$$;
CREATE OR REPLACE FUNCTION public.identity_clear_failed_logins(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.customer_credentials SET failed_attempts = 0, locked_until = NULL, updated_at = clock_timestamp() WHERE user_id = p_user_id
$$;
CREATE OR REPLACE FUNCTION public.identity_create_session(
  p_user_id uuid, p_token_hash varchar, p_csrf_hash varchar,
  p_idle_expires timestamptz, p_absolute_expires timestamptz
) RETURNS TABLE(id uuid, user_id uuid, token_hash varchar, csrf_token_hash varchar, idle_expires_at timestamptz, absolute_expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO public.customer_sessions(user_id, token_hash, csrf_token_hash, idle_expires_at, absolute_expires_at)
  VALUES (p_user_id, p_token_hash, p_csrf_hash, p_idle_expires, p_absolute_expires)
  RETURNING customer_sessions.id, customer_sessions.user_id, customer_sessions.token_hash,
    customer_sessions.csrf_token_hash, customer_sessions.idle_expires_at, customer_sessions.absolute_expires_at
$$;
CREATE OR REPLACE FUNCTION public.identity_find_session(p_token_hash varchar, p_now timestamptz)
RETURNS TABLE(id uuid, user_id uuid, token_hash varchar, csrf_token_hash varchar, idle_expires_at timestamptz, absolute_expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT s.id, s.user_id, s.token_hash, s.csrf_token_hash, s.idle_expires_at, s.absolute_expires_at
    FROM public.customer_sessions s
   WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL
     AND s.idle_expires_at > p_now AND s.absolute_expires_at > p_now
$$;
CREATE OR REPLACE FUNCTION public.identity_touch_session(p_session_id uuid, p_idle_expires timestamptz, p_now timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.customer_sessions SET last_seen_at = p_now, idle_expires_at = least(p_idle_expires, absolute_expires_at)
   WHERE id = p_session_id AND revoked_at IS NULL
$$;
CREATE OR REPLACE FUNCTION public.identity_rotate_session(p_session_id uuid, p_token_hash varchar, p_csrf_hash varchar, p_idle_expires timestamptz)
RETURNS TABLE(id uuid, user_id uuid, token_hash varchar, csrf_token_hash varchar, idle_expires_at timestamptz, absolute_expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.customer_sessions
     SET token_hash = p_token_hash, csrf_token_hash = p_csrf_hash,
         idle_expires_at = least(p_idle_expires, absolute_expires_at), last_seen_at = clock_timestamp()
   WHERE customer_sessions.id = p_session_id AND revoked_at IS NULL
  RETURNING customer_sessions.id, customer_sessions.user_id, customer_sessions.token_hash,
    customer_sessions.csrf_token_hash, customer_sessions.idle_expires_at, customer_sessions.absolute_expires_at
$$;
CREATE OR REPLACE FUNCTION public.identity_revoke_session(p_session_id uuid, p_now timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.customer_sessions SET revoked_at = p_now WHERE id = p_session_id AND revoked_at IS NULL
$$;
CREATE OR REPLACE FUNCTION public.identity_revoke_all_sessions(p_user_id uuid, p_now timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.customer_sessions SET revoked_at = p_now WHERE user_id = p_user_id AND revoked_at IS NULL
$$;
ALTER FUNCTION public.identity_find_credential(varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.identity_record_failed_login(uuid, timestamptz) OWNER TO bg_bank_owner;
ALTER FUNCTION public.identity_clear_failed_logins(uuid) OWNER TO bg_bank_owner;
ALTER FUNCTION public.identity_create_session(uuid, varchar, varchar, timestamptz, timestamptz) OWNER TO bg_bank_owner;
ALTER FUNCTION public.identity_find_session(varchar, timestamptz) OWNER TO bg_bank_owner;
ALTER FUNCTION public.identity_touch_session(uuid, timestamptz, timestamptz) OWNER TO bg_bank_owner;
ALTER FUNCTION public.identity_rotate_session(uuid, varchar, varchar, timestamptz) OWNER TO bg_bank_owner;
ALTER FUNCTION public.identity_revoke_session(uuid, timestamptz) OWNER TO bg_bank_owner;
ALTER FUNCTION public.identity_revoke_all_sessions(uuid, timestamptz) OWNER TO bg_bank_owner;
REVOKE ALL ON FUNCTION public.identity_find_credential(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_record_failed_login(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_clear_failed_logins(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_create_session(uuid, varchar, varchar, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_find_session(varchar, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_touch_session(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_rotate_session(uuid, varchar, varchar, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_revoke_session(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_revoke_all_sessions(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.identity_find_credential(varchar) TO bg_bank_runtime;
GRANT EXECUTE ON FUNCTION public.identity_record_failed_login(uuid, timestamptz) TO bg_bank_runtime;
GRANT EXECUTE ON FUNCTION public.identity_clear_failed_logins(uuid) TO bg_bank_runtime;
GRANT EXECUTE ON FUNCTION public.identity_create_session(uuid, varchar, varchar, timestamptz, timestamptz) TO bg_bank_runtime;
GRANT EXECUTE ON FUNCTION public.identity_find_session(varchar, timestamptz) TO bg_bank_runtime;
GRANT EXECUTE ON FUNCTION public.identity_touch_session(uuid, timestamptz, timestamptz) TO bg_bank_runtime;
GRANT EXECUTE ON FUNCTION public.identity_rotate_session(uuid, varchar, varchar, timestamptz) TO bg_bank_runtime;
GRANT EXECUTE ON FUNCTION public.identity_revoke_session(uuid, timestamptz) TO bg_bank_runtime;
GRANT EXECUTE ON FUNCTION public.identity_revoke_all_sessions(uuid, timestamptz) TO bg_bank_runtime;
