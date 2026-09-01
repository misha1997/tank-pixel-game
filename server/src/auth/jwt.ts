import jwt from 'jsonwebtoken';

const SESSION_SECRET: string = (() => {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET environment variable is required');
  return value;
})();

const SESSION_TTL = '30d';

export interface SessionPayload {
  sub: string;
}

export function signSessionToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies SessionPayload, SESSION_SECRET, {
    expiresIn: SESSION_TTL,
  });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, SESSION_SECRET);
    if (typeof decoded === 'object' && decoded && typeof decoded.sub === 'string') {
      return { sub: decoded.sub };
    }
    return null;
  } catch {
    return null;
  }
}
