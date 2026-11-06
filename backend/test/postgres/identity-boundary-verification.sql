-- OWNER-APPROVAL REQUIRED. Read-only PostgreSQL catalog verification.
-- Never run automatically. Set custom.app_identity_login_role to the exact
-- deployment LOGIN role name before execution; no role is created or changed.

DO $$
DECLARE
  fn record;
  expected text[] := ARRAY[
    'identity_find_credential(varchar)', 'identity_find_session(varchar, timestamptz)',
    'identity_revoke_session_by_token(varchar, timestamptz)',
    'identity_revoke_all_sessions_by_token(varchar, timestamptz)',
    'identity_record_failed_login_for_identifier(varchar, timestamptz)',
    'identity_clear_failed_logins_for_identifier(varchar)',
    'identity_create_session_for_identifier(varchar, varchar, varchar, timestamptz, timestamptz)',
    'identity_touch_session_by_token(varchar, timestamptz, timestamptz)',
    'identity_rotate_session_by_token(varchar, varchar, varchar, timestamptz)'
  ];
  role_name text := current_setting('custom.app_identity_login_role', true);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bg_bank_identity' AND NOT rolcanlogin) THEN
    RAISE EXCEPTION 'bg_bank_identity must exist and be NOLOGIN';
  END IF;
  IF role_name IS NULL OR role_name = '' THEN
    RAISE EXCEPTION 'Set custom.app_identity_login_role to the deployment LOGIN role name';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'deployment LOGIN role has unsafe attributes or does not exist: %', role_name;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid WHERE m.member = role_name::regrole AND r.rolname <> 'bg_bank_identity') THEN
    RAISE EXCEPTION 'deployment LOGIN role has prohibited role membership: %', role_name;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid WHERE m.member = role_name::regrole AND r.rolname = 'bg_bank_identity') THEN
    RAISE EXCEPTION 'deployment LOGIN role is not a member of bg_bank_identity: %', role_name;
  END IF;
  FOREACH role_name IN ARRAY expected LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = role_name) THEN
      RAISE EXCEPTION 'missing intended identity function: %', role_name;
    END IF;
  END LOOP;
  FOR fn IN SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args, r.rolname owner, p.prosecdef, p.proconfig, p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='public' AND p.proname LIKE 'identity_%' LOOP
    IF fn.owner <> 'bg_bank_owner' OR NOT fn.prosecdef OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] THEN
      RAISE EXCEPTION 'identity function owner/security/search_path failure: %.%', fn.proname, fn.args;
    END IF;
    IF EXISTS (SELECT 1 FROM aclexplode(COALESCE(fn.proacl, acldefault('f', (SELECT oid FROM pg_roles WHERE rolname = fn.owner)))) a WHERE (a.grantee = 0 OR a.grantee IN ('bg_bank_runtime'::regrole, 'bg_bank_app'::regrole)) AND a.privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'ambient role can execute identity function: %.%', fn.proname, fn.args;
    END IF;
    IF NOT has_function_privilege('bg_bank_identity', fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'identity group cannot execute function: %.%', fn.proname, fn.args;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'identity_%' AND pg_get_function_identity_arguments(p.oid) LIKE '%uuid%') THEN
    RAISE EXCEPTION 'legacy UUID-targeted identity overload remains';
  END IF;
END $$;

-- Session preservation requires an owner-provided pre-migration baseline.
-- Compare the recorded customer_sessions count and IDs with this query after
-- migration; this script intentionally performs no writes or baseline capture.
SELECT count(*) AS customer_session_count, md5(string_agg(id::text, ',' ORDER BY id)) AS customer_session_ids
  FROM public.customer_sessions;
