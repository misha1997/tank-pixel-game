import { Router } from 'express';
import type { AuthUser } from '@tank/shared';
import { prisma } from '../db/prisma.js';
import { hashPassword, verifyPassword } from './password.js';
import { signSessionToken, verifySessionToken } from './jwt.js';

export const SESSION_COOKIE = 'tank_session';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
const MIN_PASSWORD_LENGTH = 6;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

function toAuthUser(user: { id: string; username: string; rating: number }): AuthUser {
  return { id: user.id, username: user.username, rating: user.rating };
}

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    res.status(400).json({ error: 'Username must be 3-20 characters (letters, digits, underscore).' });
    return;
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    res.status(409).json({ error: 'Username is already taken.' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { username, passwordHash } });

  res.cookie(SESSION_COOKIE, signSessionToken(user.id), cookieOptions);
  res.status(201).json(toAuthUser(user));
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !valid) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  res.cookie(SESSION_COOKIE, signSessionToken(user.id), cookieOptions);
  res.json(toAuthUser(user));
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

authRouter.get('/me', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = typeof token === 'string' ? verifySessionToken(token) : null;

  if (!session) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  res.json(toAuthUser(user));
});
