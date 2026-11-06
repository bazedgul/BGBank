import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase D migration safety invariants', () => {
  const migration = readFileSync(
    resolve(__dirname, '0009_phase_d_customer_transfers.sql'),
    'utf8',
  );

  it('requires exact transfer terminal-state metadata', () => {
    expect(migration).toContain('"state" = \'posted\'');
    expect(migration).toContain('"state" = \'completed\'');
    expect(migration).toContain("\"state\" IN ('created', 'rejected')");
    expect(migration).toContain('transfers_currency_source_fk');
    expect(migration).toContain('transfers_currency_destination_fk');
  });

  it('defines the owner-controlled transfer boundary without extension hashing', () => {
    const transferMigration = readFileSync(
      resolve(__dirname, '0010_phase_d_transfer_boundary.sql'),
      'utf8',
    );
    expect(transferMigration).toContain(
      "sha256(convert_to(v_canonical, 'UTF8'))",
    );
    expect(transferMigration).toContain('SET search_path = pg_catalog, public');
    expect(transferMigration).toContain("session_user <> 'bg_bank_app'");
    expect(transferMigration).toContain(
      'ALTER FUNCTION public.execute_internal_transfer',
    );
    expect(transferMigration).toContain(
      'REVOKE ALL ON FUNCTION public.execute_internal_transfer',
    );
    expect(transferMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.execute_internal_transfer',
    );
    expect(transferMigration).not.toContain('CREATE EXTENSION');
  });

  it('defines owner-controlled identity and session functions without table DML grants', () => {
    const identityMigration = readFileSync(
      resolve(__dirname, '0011_phase_d_identity_boundary.sql'),
      'utf8',
    );
    expect(identityMigration).toContain('SET search_path = pg_catalog, public');
    expect(identityMigration).toContain(
      'ALTER FUNCTION public.identity_find_credential',
    );
    expect(identityMigration).toContain('identity_revoke_all_sessions');
    expect(identityMigration).toContain('REVOKE ALL ON FUNCTION');
    expect(identityMigration).toContain('GRANT EXECUTE ON FUNCTION');
    expect(identityMigration).not.toContain('GRANT INSERT');
    expect(identityMigration).not.toContain('GRANT UPDATE');
  });

  it('protects scoped idempotency records and completed replay data', () => {
    expect(migration).toContain('UNIQUE ("scope", "key")');
    expect(migration).toContain('idempotency_keys_terminal_consistency_check');
    expect(migration).toContain('idempotency_keys_completed_result_check');
  });

  it('removes UUID-targeted identity capabilities in the forward migration', () => {
    const hardening = readFileSync(
      resolve(__dirname, '0012_identity_role_boundary.sql'),
      'utf8',
    );
    expect(hardening).toContain(
      'DROP FUNCTION public.identity_revoke_session(uuid, timestamptz)',
    );
    expect(hardening).toContain(
      'DROP FUNCTION public.identity_revoke_all_sessions(uuid, timestamptz)',
    );
    expect(hardening).toContain('identity_revoke_all_sessions_by_token');
    expect(hardening).toContain(
      'REVOKE ALL ON FUNCTION public.identity_find_credential',
    );
    expect(hardening).not.toMatch(/GRANT EXECUTE[^\n]*bg_bank_runtime/);
  });

  it('removes every UUID-targeted identity signature and grants only the group role', () => {
    const migration013 = readFileSync(
      resolve(__dirname, '0013_identity_token_boundary.sql'),
      'utf8',
    );
    for (const signature of [
      'identity_record_failed_login(uuid, timestamptz)',
      'identity_clear_failed_logins(uuid)',
      'identity_create_session(uuid, varchar, varchar, timestamptz, timestamptz)',
      'identity_touch_session(uuid, timestamptz, timestamptz)',
      'identity_rotate_session(uuid, varchar, varchar, timestamptz)',
    ])
      expect(migration013).toContain(`DROP FUNCTION public.${signature}`);
    expect(migration013).toContain(
      'bg_bank_identity must be NOLOGIN before migration 0013',
    );
    expect(migration013).toContain('TO bg_bank_identity');
    expect(migration013).not.toMatch(/GRANT EXECUTE[\s\S]*TO bg_bank_runtime/);
    expect(migration013).not.toMatch(/GRANT EXECUTE[\s\S]*TO bg_bank_app/);
    expect(migration013).not.toMatch(/PASSWORD\s*['"]/i);
  });

  it('assigns bg_bank_owner to every new SECURITY DEFINER function', () => {
    const sql = readFileSync(
      resolve(__dirname, '0013_identity_token_boundary.sql'),
      'utf8',
    );
    for (const signature of [
      'identity_record_failed_login_for_identifier(varchar, timestamptz)',
      'identity_clear_failed_logins_for_identifier(varchar)',
      'identity_create_session_for_identifier(varchar, varchar, varchar, timestamptz, timestamptz)',
      'identity_touch_session_by_token(varchar, timestamptz, timestamptz)',
      'identity_rotate_session_by_token(varchar, varchar, varchar, timestamptz)',
    ]) {
      expect(sql).toContain(
        `ALTER FUNCTION public.${signature} OWNER TO bg_bank_owner`,
      );
    }
  });
});
