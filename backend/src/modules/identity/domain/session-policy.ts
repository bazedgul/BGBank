export type SessionClass = 'customer' | 'admin';

export interface SessionPolicy {
  idleSeconds: number;
  absoluteSeconds: number;
}

export const sessionPolicies: Record<SessionClass, SessionPolicy> = {
  customer: { idleSeconds: 30 * 60, absoluteSeconds: 7 * 24 * 60 * 60 },
  admin: { idleSeconds: 15 * 60, absoluteSeconds: 8 * 60 * 60 },
};

export function isSessionUsable(
  session: {
    revokedAt: Date | null;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  },
  now = new Date(),
): boolean {
  return (
    session.revokedAt === null &&
    session.idleExpiresAt > now &&
    session.absoluteExpiresAt > now
  );
}
