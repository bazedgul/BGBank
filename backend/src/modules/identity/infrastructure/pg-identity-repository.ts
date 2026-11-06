import type { Pool } from 'pg';
import type {
  CredentialRecord,
  IdentityRepository,
  IdentityUser,
  SessionRecord,
} from '../application/identity-service';

type CredentialRow = CredentialRecord & { user: IdentityUser };

export class PgIdentityRepository implements IdentityRepository {
  constructor(private readonly pool: Pool) {}

  async findCredential(identifier: string): Promise<CredentialRow | null> {
    const result = await this.pool.query<CredentialRow>({
      text: `SELECT login_identifier AS "identifier", user_id AS "userId", password_hash AS "passwordHash", locked_until AS "lockedUntil",
                    json_build_object('id', user_id, 'status', user_status) AS user
               FROM public.identity_find_credential($1::varchar)`,
      values: [identifier],
    });
    return result.rows[0] ?? null;
  }

  async recordFailedLogin(identifier: string, now: Date): Promise<void> {
    await this.pool.query(
      `SELECT public.identity_record_failed_login_for_identifier($1::varchar, $2::timestamptz)`,
      [identifier, now],
    );
  }

  async clearFailedLogins(identifier: string): Promise<void> {
    await this.pool.query(
      `SELECT public.identity_clear_failed_logins_for_identifier($1::varchar)`,
      [identifier],
    );
  }

  async createSession(input: {
    identifier: string;
    tokenHash: string;
    csrfTokenHash: string;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  }): Promise<SessionRecord> {
    const result = await this.pool.query<SessionRecord>({
      text: `SELECT id, user_id AS "userId", token_hash AS "tokenHash", csrf_token_hash AS "csrfTokenHash",
                    idle_expires_at AS "idleExpiresAt", absolute_expires_at AS "absoluteExpiresAt"
               FROM public.identity_create_session_for_identifier($1::varchar, $2::varchar, $3::varchar, $4::timestamptz, $5::timestamptz)`,
      values: [
        input.identifier,
        input.tokenHash,
        input.csrfTokenHash,
        input.idleExpiresAt,
        input.absoluteExpiresAt,
      ],
    });
    return result.rows[0];
  }

  async findUsableSession(
    tokenHash: string,
    now: Date,
  ): Promise<SessionRecord | null> {
    const result = await this.pool.query<SessionRecord>({
      text: `SELECT id, user_id AS "userId", token_hash AS "tokenHash", csrf_token_hash AS "csrfTokenHash",
                    idle_expires_at AS "idleExpiresAt", absolute_expires_at AS "absoluteExpiresAt"
               FROM public.identity_find_session($1::varchar, $2::timestamptz)`,
      values: [tokenHash, now],
    });
    return result.rows[0] ?? null;
  }

  async revokeSessionByToken(tokenHash: string, now: Date): Promise<void> {
    await this.pool.query(
      `SELECT public.identity_revoke_session_by_token($1::varchar, $2::timestamptz)`,
      [tokenHash, now],
    );
  }

  async touchSession(
    tokenHash: string,
    idleExpiresAt: Date,
    now: Date,
  ): Promise<void> {
    await this.pool.query(
      `SELECT public.identity_touch_session_by_token($1::varchar, $2::timestamptz, $3::timestamptz)`,
      [tokenHash, idleExpiresAt, now],
    );
  }

  async rotateSession(
    tokenHash: string,
    input: { tokenHash: string; csrfTokenHash: string; idleExpiresAt: Date },
  ): Promise<SessionRecord> {
    const result = await this.pool.query<SessionRecord>({
      text: `SELECT id, user_id AS "userId", token_hash AS "tokenHash", csrf_token_hash AS "csrfTokenHash",
                    idle_expires_at AS "idleExpiresAt", absolute_expires_at AS "absoluteExpiresAt"
               FROM public.identity_rotate_session_by_token($1::varchar, $2::varchar, $3::varchar, $4::timestamptz)`,
      values: [
        tokenHash,
        input.tokenHash,
        input.csrfTokenHash,
        input.idleExpiresAt,
      ],
    });
    if (!result.rows[0]) throw new Error('session rotation failed');
    return result.rows[0];
  }

  async revokeAllSessionsByToken(tokenHash: string, now: Date): Promise<void> {
    await this.pool.query(
      `SELECT public.identity_revoke_all_sessions_by_token($1::varchar, $2::timestamptz)`,
      [tokenHash, now],
    );
  }
}
