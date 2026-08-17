import type { Request } from 'express';
import { verifySessionToken } from './jwt.js';

export const SESSION_COOKIE = 'tank_session';

export function getSessionUserId(req: Request): string | null {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string') return null;
  return verifySessionToken(token)?.sub ?? null;
}
