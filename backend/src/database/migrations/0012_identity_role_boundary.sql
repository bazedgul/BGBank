-- Forward-only hardening of 0011. Credentials are provisioned out of band;
-- migrations never contain passwords or connection strings.
REVOKE ALL ON FUNCTION public.identity_find_credential(varchar) FROM bg_bank_runtime;
REVOKE ALL ON FUNCTION public.identity_record_failed_login(uuid, timestamptz) FROM bg_bank_runtime;
REVOKE ALL ON FUNCTION public.identity_clear_failed_logins(uuid) FROM bg_bank_runtime;
REVOKE ALL ON FUNCTION public.identity_create_session(uuid, varchar, varchar, timestamptz, timestamptz) FROM bg_bank_runtime;
REVOKE ALL ON FUNCTION public.identity_find_session(varchar, timestamptz) FROM bg_bank_runtime;
REVOKE ALL ON FUNCTION public.identity_touch_session(uuid, timestamptz, timestamptz) FROM bg_bank_runtime;
REVOKE ALL ON FUNCTION public.identity_rotate_session(uuid, varchar, varchar, timestamptz) FROM bg_bank_runtime;
REVOKE ALL ON FUNCTION public.identity_revoke_session(uuid, timestamptz) FROM bg_bank_runtime;
REVOKE ALL ON FUNCTION public.identity_revoke_all_sessions(uuid, timestamptz) FROM bg_bank_runtime;

-- Remove the old callable UUID-targeted surface after the replacement exists.
DROP FUNCTION public.identity_revoke_all_sessions(uuid, timestamptz);
DROP FUNCTION public.identity_revoke_session(uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.identity_revoke_session_by_token(
  p_token_hash varchar, p_now timestamptz
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.customer_sessions
     SET revoked_at = p_now
   WHERE token_hash = p_token_hash AND revoked_at IS NULL
$$;

ALTER FUNCTION public.identity_revoke_session_by_token(varchar, timestamptz) OWNER TO bg_bank_owner;
REVOKE ALL ON FUNCTION public.identity_revoke_session_by_token(varchar, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.identity_revoke_all_sessions_by_token(
  p_token_hash varchar, p_now timestamptz
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.customer_sessions AS target
     SET revoked_at = p_now
   WHERE target.user_id = (
     SELECT current_session.user_id
       FROM public.customer_sessions AS current_session
      WHERE current_session.token_hash = p_token_hash
        AND current_session.revoked_at IS NULL
        AND current_session.idle_expires_at > p_now
        AND current_session.absolute_expires_at > p_now
   )
     AND target.revoked_at IS NULL
$$;

ALTER FUNCTION public.identity_revoke_all_sessions_by_token(varchar, timestamptz) OWNER TO bg_bank_owner;
REVOKE ALL ON FUNCTION public.identity_revoke_all_sessions_by_token(varchar, timestamptz) FROM PUBLIC;
-- The actual role name is provisioned by deployment configuration, never here.
-- Deployment must GRANT EXECUTE to the dedicated identity login only.
