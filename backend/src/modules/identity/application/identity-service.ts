import { issueCsrfToken } from '../../../shared/security/csrf';
import {
  issueOpaqueToken,
  hashOpaqueToken,
} from '../../../shared/security/opaque-token';
import { sessionPolicies } from '../domain/session-policy';
import type { PasswordHasher } from '../domain/password-hasher';

export interface IdentityUser {
  id: string;
  status: 'active' | 'pending' | 'suspended' | 'closed';
}
export interface CredentialRecord {
  identifier: string;
  userId: string;
  passwordHash: string;
  lockedUntil: Date | null;
}
export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface IdentityRepository {
  findCredential(
    identifier: string,
  ): Promise<(CredentialRecord & { user: IdentityUser }) | null>;
  recordFailedLogin(identifier: string, now: Date): Promise<void>;
  clearFailedLogins(identifier: string): Promise<void>;
  createSession(input: {
    identifier: string;
    tokenHash: string;
    csrfTokenHash: string;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  }): Promise<SessionRecord>;
  findUsableSession(
    tokenHash: string,
    now: Date,
  ): Promise<SessionRecord | null>;
  touchSession(
    tokenHash: string,
    idleExpiresAt: Date,
    now: Date,
  ): Promise<void>;
  revokeSessionByToken(tokenHash: string, now: Date): Promise<void>;
  rotateSession(
    tokenHash: string,
    input: { tokenHash: string; csrfTokenHash: string; idleExpiresAt: Date },
  ): Promise<SessionRecord>;
  revokeAllSessionsByToken(tokenHash: string, now: Date): Promise<void>;
}

export class AuthenticationError extends Error {}
export class SessionSecurityError extends Error {}

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$T6mw1pZUXgd/IeyTOVuXRQ$s1DrAWJohwe7zNAgLtJUGeeQwCwMqLLLQxBsCuwD09A';

export class IdentityService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async authenticate(
    identifier: string,
    password: string,
    now = new Date(),
  ): Promise<{
    user: IdentityUser;
    session: SessionRecord;
    token: string;
    csrfToken: string;
  }> {
    const record = await this.repository.findCredential(
      identifier.trim().toLowerCase(),
    );
    const eligible =
      record !== null &&
      record.user.status === 'active' &&
      (record.lockedUntil === null || record.lockedUntil <= now);
    const verified = await this.hasher.verify(
      eligible ? record.passwordHash : DUMMY_PASSWORD_HASH,
      password,
    );
    if (!record || !eligible) {
      throw new AuthenticationError('authentication failed');
    }
    if (!verified) {
      await this.repository.recordFailedLogin(record.identifier, now);
      throw new AuthenticationError('authentication failed');
    }
    await this.repository.clearFailedLogins(record.identifier);
    const token = issueOpaqueToken();
    const csrf = issueCsrfToken();
    const policy = sessionPolicies.customer;
    const absoluteExpiresAt = new Date(
      now.getTime() + policy.absoluteSeconds * 1000,
    );
    const idleExpiresAt = new Date(now.getTime() + policy.idleSeconds * 1000);
    const session = await this.repository.createSession({
      identifier: record.identifier,
      tokenHash: token.hash,
      csrfTokenHash: csrf.hash,
      idleExpiresAt,
      absoluteExpiresAt,
    });
    return {
      user: record.user,
      session,
      token: token.value,
      csrfToken: csrf.value,
    };
  }

  async loadSession(
    rawToken: string,
    now = new Date(),
  ): Promise<SessionRecord> {
    const session = await this.repository.findUsableSession(
      hashOpaqueToken(rawToken),
      now,
    );
    if (!session) throw new AuthenticationError('authentication required');
    const nextIdle = new Date(
      now.getTime() + sessionPolicies.customer.idleSeconds * 1000,
    );
    await this.repository.touchSession(
      hashOpaqueToken(rawToken),
      nextIdle,
      now,
    );
    return session;
  }

  async logout(rawToken: string, now = new Date()): Promise<void> {
    await this.loadSession(rawToken, now);
    await this.repository.revokeSessionByToken(hashOpaqueToken(rawToken), now);
  }

  async rotate(rawToken: string, now = new Date()) {
    await this.loadSession(rawToken, now);
    const token = issueOpaqueToken();
    const csrf = issueCsrfToken();
    const idleExpiresAt = new Date(
      now.getTime() + sessionPolicies.customer.idleSeconds * 1000,
    );
    const rotated = await this.repository.rotateSession(
      hashOpaqueToken(rawToken),
      {
        tokenHash: token.hash,
        csrfTokenHash: csrf.hash,
        idleExpiresAt,
      },
    );
    return { session: rotated, token: token.value, csrfToken: csrf.value };
  }

  async logoutAll(rawToken: string, now = new Date()) {
    await this.loadSession(rawToken, now);
    await this.repository.revokeAllSessionsByToken(
      hashOpaqueToken(rawToken),
      now,
    );
  }
}
