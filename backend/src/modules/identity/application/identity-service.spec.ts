import { beforeEach } from '@jest/globals';
import {
  IdentityService,
  AuthenticationError,
  type IdentityRepository,
} from './identity-service';
import type { PasswordHasher } from '../domain/password-hasher';

describe('IdentityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  const repo = (): jest.Mocked<IdentityRepository> => ({
    findCredential: jest.fn(),
    recordFailedLogin: jest.fn(),
    clearFailedLogins: jest.fn(),
    createSession: jest.fn(),
    findUsableSession: jest.fn(),
    touchSession: jest.fn(),
    revokeSessionByToken: jest.fn(),
    rotateSession: jest.fn(),
    revokeAllSessionsByToken: jest.fn(),
  });
  const hasher: jest.Mocked<PasswordHasher> = {
    hash: jest.fn(),
    verify: jest.fn(),
  };

  it('creates an opaque session only after successful Argon2id verification', async () => {
    const r = repo();
    r.findCredential.mockResolvedValue({
      identifier: 'customer@example.test',
      userId: 'u',
      passwordHash: 'hash',
      lockedUntil: null,
      user: { id: 'u', status: 'active' },
    });
    hasher.verify.mockResolvedValue(true);
    r.createSession.mockImplementation(async (input) => ({
      id: 's',
      userId: 'u',
      tokenHash: input.tokenHash,
      csrfTokenHash: input.csrfTokenHash,
      idleExpiresAt: input.idleExpiresAt,
      absoluteExpiresAt: input.absoluteExpiresAt,
    }));
    const result = await new IdentityService(r, hasher).authenticate(
      ' Customer@Example.test ',
      'password',
    );
    expect(result.token).not.toBe(result.session.tokenHash);
    expect(r.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'customer@example.test' }),
    );
  });

  it('does not reveal whether an identifier exists', async () => {
    const r = repo();
    r.findCredential.mockResolvedValue(null);
    await expect(
      new IdentityService(r, hasher).authenticate('missing', 'password'),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(hasher.verify).toHaveBeenCalledTimes(1);
  });

  it('uses the dummy verification path for a disabled account', async () => {
    const r = repo();
    r.findCredential.mockResolvedValue({
      identifier: 'suspended',
      userId: 'u',
      passwordHash: 'malformed',
      lockedUntil: null,
      user: { id: 'u', status: 'suspended' },
    });
    hasher.verify.mockResolvedValue(true);
    await expect(
      new IdentityService(r, hasher).authenticate('suspended', 'password'),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(hasher.verify).toHaveBeenCalledWith(
      expect.stringContaining('$argon2id$'),
      'password',
    );
    expect(r.recordFailedLogin).not.toHaveBeenCalled();
  });

  it('derives logout-all ownership from the presented token', async () => {
    const r = repo();
    r.findUsableSession.mockResolvedValue({
      id: 's',
      userId: 'u',
      tokenHash: 'h',
      csrfTokenHash: 'c',
      idleExpiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 60_000),
    });
    await new IdentityService(r, hasher).logoutAll('raw-token');
    expect(r.revokeAllSessionsByToken).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Date),
    );
  });
});
