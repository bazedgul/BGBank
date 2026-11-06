-- Forward-only identity boundary hardening.
-- No credentials are created here. Deployment provisions a LOGIN role and
-- grants it membership in bg_bank_identity using secret-manager material.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bg_bank_identity') THEN
    RAISE EXCEPTION 'Provision bg_bank_identity NOLOGIN with the owner-approved bootstrap before migration 0013';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bg_bank_identity' AND rolcanlogin) THEN
    RAISE EXCEPTION 'bg_bank_identity must be NOLOGIN before migration 0013';
  END IF;
END
$$;

-- Replace every UUID-targeted legacy identity operation with an operation
-- bound to an identifier or to the presented token. Existing sessions remain.
CREATE OR REPLACE FUNCTION public.identity_record_failed_login_for_identifier(
  p_identifier varchar, p_now timestamptz
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.customer_credentials
     SET failed_attempts = failed_attempts + 1,
         locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN p_now + interval '15 minutes' ELSE locked_until END,
         updated_at = clock_timestamp()
   WHERE login_identifier = lower(trim(p_identifier))
$$;

CREATE OR REPLACE FUNCTION public.identity_clear_failed_logins_for_identifier(
  p_identifier varchar
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.customer_credentials
     SET failed_attempts = 0, locked_until = NULL, updated_at = clock_timestamp()
   WHERE login_identifier = lower(trim(p_identifier))
$$;

CREATE OR REPLACE FUNCTION public.identity_create_session_for_identifier(
  p_identifier varchar, p_token_hash varchar, p_csrf_hash varchar,
  p_idle_expires timestamptz, p_absolute_expires timestamptz
) RETURNS TABLE(id uuid, user_id uuid, token_hash varchar, csrf_token_hash varchar,
                idle_expires_at timestamptz, absolute_expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO public.customer_sessions(user_id, token_hash, csrf_token_hash,
                                       idle_expires_at, absolute_expires_at)
  SELECT c.user_id, p_token_hash, p_csrf_hash, p_idle_expires, p_absolute_expires
    FROM public.customer_credentials c
    JOIN public.users u ON u.id = c.user_id
   WHERE c.login_identifier = lower(trim(p_identifier))
     AND u.status = 'active'
  RETURNING customer_sessions.id, customer_sessions.user_id,
            customer_sessions.token_hash, customer_sessions.csrf_token_hash,
            customer_sessions.idle_expires_at, customer_sessions.absolute_expires_at
$$;

CREATE OR REPLACE FUNCTION public.identity_touch_session_by_token(
  p_token_hash varchar, p_idle_expires timestamptz, p_now timestamptz
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.customer_sessions
     SET last_seen_at = p_now, idle_expires_at = least(p_idle_expires, absolute_expires_at)
   WHERE token_hash = p_token_hash AND revoked_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.identity_rotate_session_by_token(
  p_token_hash varchar, p_new_token_hash varchar, p_csrf_hash varchar,
  p_idle_expires timestamptz
) RETURNS TABLE(id uuid, user_id uuid, token_hash varchar, csrf_token_hash varchar,
                idle_expires_at timestamptz, absolute_expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.customer_sessions
     SET token_hash = p_new_token_hash, csrf_token_hash = p_csrf_hash,
         idle_expires_at = least(p_idle_expires, absolute_expires_at),
         last_seen_at = clock_timestamp()
   WHERE customer_sessions.token_hash = p_token_hash
     AND revoked_at IS NULL
  RETURNING customer_sessions.id, customer_sessions.user_id,
            customer_sessions.token_hash, customer_sessions.csrf_token_hash,
            customer_sessions.idle_expires_at, customer_sessions.absolute_expires_at
$$;

-- Remove every remaining UUID-targeted legacy callable signature.
DROP FUNCTION public.identity_record_failed_login(uuid, timestamptz);
DROP FUNCTION public.identity_clear_failed_logins(uuid);
DROP FUNCTION public.identity_create_session(uuid, varchar, varchar, timestamptz, timestamptz);
DROP FUNCTION public.identity_touch_session(uuid, timestamptz, timestamptz);
DROP FUNCTION public.identity_rotate_session(uuid, varchar, varchar, timestamptz);

ALTER FUNCTION public.identity_record_failed_login_for_identifier(varchar, timestamptz) OWNER TO bg_bank_owner;
ALTER FUNCTION public.identity_clear_failed_logins_for_identifier(varchar) OWNER TO bg_bank_owner;
ALTER FUNCTION public.identity_create_session_for_identifier(varchar, varchar, varchar, timestamptz, timestamptz) OWNER TO bg_bank_owner;
ALTER FUNCTION public.identity_touch_session_by_token(varchar, timestamptz, timestamptz) OWNER TO bg_bank_owner;
ALTER FUNCTION public.identity_rotate_session_by_token(varchar, varchar, varchar, timestamptz) OWNER TO bg_bank_owner;

-- No identity function is callable by ambient roles. The dedicated identity
-- process is trusted to perform Argon2id verification before session creation;
-- PostgreSQL enforces role separation but cannot independently attest that
-- application-side verification occurred.
REVOKE ALL ON FUNCTION public.identity_find_credential(varchar) FROM PUBLIC, bg_bank_runtime, bg_bank_app;
REVOKE ALL ON FUNCTION public.identity_find_session(varchar, timestamptz) FROM PUBLIC, bg_bank_runtime, bg_bank_app;
REVOKE ALL ON FUNCTION public.identity_revoke_session_by_token(varchar, timestamptz) FROM PUBLIC, bg_bank_runtime, bg_bank_app;
REVOKE ALL ON FUNCTION public.identity_revoke_all_sessions_by_token(varchar, timestamptz) FROM PUBLIC, bg_bank_runtime, bg_bank_app;
REVOKE ALL ON FUNCTION public.identity_record_failed_login_for_identifier(varchar, timestamptz) FROM PUBLIC, bg_bank_runtime, bg_bank_app;
REVOKE ALL ON FUNCTION public.identity_clear_failed_logins_for_identifier(varchar) FROM PUBLIC, bg_bank_runtime, bg_bank_app;
REVOKE ALL ON FUNCTION public.identity_create_session_for_identifier(varchar, varchar, varchar, timestamptz, timestamptz) FROM PUBLIC, bg_bank_runtime, bg_bank_app;
REVOKE ALL ON FUNCTION public.identity_touch_session_by_token(varchar, timestamptz, timestamptz) FROM PUBLIC, bg_bank_runtime, bg_bank_app;
REVOKE ALL ON FUNCTION public.identity_rotate_session_by_token(varchar, varchar, varchar, timestamptz) FROM PUBLIC, bg_bank_runtime, bg_bank_app;

GRANT EXECUTE ON FUNCTION public.identity_find_credential(varchar) TO bg_bank_identity;
GRANT EXECUTE ON FUNCTION public.identity_find_session(varchar, timestamptz) TO bg_bank_identity;
GRANT EXECUTE ON FUNCTION public.identity_revoke_session_by_token(varchar, timestamptz) TO bg_bank_identity;
GRANT EXECUTE ON FUNCTION public.identity_revoke_all_sessions_by_token(varchar, timestamptz) TO bg_bank_identity;
GRANT EXECUTE ON FUNCTION public.identity_record_failed_login_for_identifier(varchar, timestamptz) TO bg_bank_identity;
GRANT EXECUTE ON FUNCTION public.identity_clear_failed_logins_for_identifier(varchar) TO bg_bank_identity;
GRANT EXECUTE ON FUNCTION public.identity_create_session_for_identifier(varchar, varchar, varchar, timestamptz, timestamptz) TO bg_bank_identity;
GRANT EXECUTE ON FUNCTION public.identity_touch_session_by_token(varchar, timestamptz, timestamptz) TO bg_bank_identity;
GRANT EXECUTE ON FUNCTION public.identity_rotate_session_by_token(varchar, varchar, varchar, timestamptz) TO bg_bank_identity;
