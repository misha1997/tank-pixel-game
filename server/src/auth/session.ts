import type { Request } from 'express';
import type { Socket } from 'socket.io';
import { verifySessionToken } from './jwt.js';

export const SESSION_COOKIE = 'tank_session';

function userIdFromCookies(cookies: Record<string, unknown> | undefined): string | null {
  const token = cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string') return null;
  return verifySessionToken(token)?.sub ?? null;
}

export function getSessionUserId(req: Request): string | null {
  return userIdFromCookies(req.cookies);
}

// Socket.io's handshake request is a plain http.IncomingMessage, not an
// Express Request — `.cookies` only exists on it at runtime because
// `io.engine.use(cookieParser())` (see index.ts) runs the same middleware
// against it. The identity this returns MUST be used instead of any
// client-supplied userId/rating field in socket payloads — a socket can
// send whatever it wants there, but it can't forge this cookie.
export function getSessionUserIdFromSocket(socket: Socket): string | null {
  const request = socket.request as unknown as { cookies?: Record<string, unknown> };
  return userIdFromCookies(request.cookies);
}
