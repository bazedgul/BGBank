import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IdentityUser } from '../application/identity-service';
export const IDENTITY_PORT = Symbol('IDENTITY_PORT');
export interface ValidatedSession {
  id: string;
  userId: string;
  csrfTokenHash: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface IdentityPort {
  authenticate(
    identifier: string,
    password: string,
  ): Promise<{ user: IdentityUser; token: string; csrfToken: string }>;
  loadSession(token: string): Promise<ValidatedSession>;
  logout(token: string): Promise<void>;
  rotate(token: string): Promise<{ token: string; csrfToken: string }>;
  logoutAll(token: string): Promise<void>;
}

@Injectable()
export class IdentityClient implements IdentityPort {
  private readonly url: string;
  private readonly auth: string;
  private readonly timeoutMs = 2_000;
  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>('IDENTITY_SERVICE_URL');
    this.auth = config.getOrThrow<string>('IDENTITY_SERVICE_AUTH_TOKEN');
  }
  private async call<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );
    try {
      const response = await globalThis.fetch(`${this.url}${path}`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.auth}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('identity service request failed');
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object')
        throw new Error('invalid identity response');
      return value as T;
    } catch {
      throw new Error('identity service unavailable');
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
  private session(value: unknown): ValidatedSession {
    if (!value || typeof value !== 'object')
      throw new Error('invalid identity response');
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).some(
        (key) =>
          ![
            'id',
            'userId',
            'csrfTokenHash',
            'idleExpiresAt',
            'absoluteExpiresAt',
          ].includes(key),
      )
    )
      throw new Error('invalid identity response');
    for (const key of [
      'id',
      'userId',
      'csrfTokenHash',
      'idleExpiresAt',
      'absoluteExpiresAt',
    ]) {
      if (typeof row[key] !== 'string')
        throw new Error('invalid identity response');
    }
    if (
      !/^[0-9a-f-]{36}$/i.test(row.id as string) ||
      !/^[0-9a-f-]{36}$/i.test(row.userId as string) ||
      !/^[0-9a-f]{64}$/i.test(row.csrfTokenHash as string)
    )
      throw new Error('invalid identity response');
    if ('tokenHash' in row || 'passwordHash' in row || 'credentialHash' in row)
      throw new Error('invalid identity response');
    const idleExpiresAt = new Date(row.idleExpiresAt as string);
    const absoluteExpiresAt = new Date(row.absoluteExpiresAt as string);
    if (
      Number.isNaN(idleExpiresAt.valueOf()) ||
      Number.isNaN(absoluteExpiresAt.valueOf())
    )
      throw new Error('invalid identity response');
    return {
      id: row.id as string,
      userId: row.userId as string,
      csrfTokenHash: row.csrfTokenHash as string,
      idleExpiresAt,
      absoluteExpiresAt,
    };
  }
  async authenticate(identifier: string, password: string) {
    const value = await this.call<unknown>('/internal/v1/authenticate', {
      identifier,
      password,
    });
    if (!value || typeof value !== 'object')
      throw new Error('invalid identity response');
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).some(
        (key) => !['user', 'token', 'csrfToken'].includes(key),
      ) ||
      typeof row.token !== 'string' ||
      typeof row.csrfToken !== 'string' ||
      !row.user
    )
      throw new Error('invalid identity response');
    if (
      !/^[A-Za-z0-9_-]{43,}$/.test(row.token) ||
      !/^[A-Za-z0-9_-]{43,}$/.test(row.csrfToken)
    )
      throw new Error('invalid identity response');
    const user = row.user as Record<string, unknown>;
    if (
      Object.keys(user).some((key) => !['id', 'status'].includes(key)) ||
      !/^[0-9a-f-]{36}$/i.test(String(user.id)) ||
      !['active', 'pending', 'suspended', 'closed'].includes(
        String(user.status),
      )
    )
      throw new Error('invalid identity response');
    return {
      user: user as unknown as IdentityUser,
      token: row.token,
      csrfToken: row.csrfToken,
    };
  }
  async loadSession(token: string) {
    return this.session(
      await this.call<unknown>('/internal/v1/session/validate', { token }),
    );
  }
  async logout(token: string) {
    await this.call('/internal/v1/session/logout', { token });
  }
  async rotate(token: string) {
    const value = await this.call<unknown>('/internal/v1/session/rotate', {
      token,
    });
    if (!value || typeof value !== 'object')
      throw new Error('invalid identity response');
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).some((key) => !['token', 'csrfToken'].includes(key)) ||
      typeof row.token !== 'string' ||
      typeof row.csrfToken !== 'string' ||
      !/^[A-Za-z0-9_-]{43,}$/.test(row.token) ||
      !/^[A-Za-z0-9_-]{43,}$/.test(row.csrfToken)
    )
      throw new Error('invalid identity response');
    return { token: row.token, csrfToken: row.csrfToken };
  }
  async logoutAll(token: string) {
    await this.call('/internal/v1/session/logout-all', { token });
  }
}
