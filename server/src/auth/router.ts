import { Router } from 'express';
import type { AuthUser } from '@tank/shared';
import { prisma } from '../db/prisma.js';
import { hashPassword, verifyPassword } from './password.js';
import { signSessionToken } from './jwt.js';
import { getSessionUserId, SESSION_COOKIE } from './session.js';

const USERNAME_PATTERN = /^[a-zA-Z0-9]{3,12}$/;
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
    res.status(400).json({ error: 'Username must be 3-12 characters (English letters and numbers).' });
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

// Renames are keyed to the session's userId — the token itself never holds
// the username, so no re-issue is needed after a successful change.
authRouter.post('/change-username', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  const { username } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    res.status(400).json({ error: 'Username must be 3-12 characters (English letters and numbers).' });
    return;
  }

  const clash = await prisma.user.findUnique({ where: { username } });
  if (clash && clash.id !== userId) {
    res.status(409).json({ error: 'Username is already taken.' });
    return;
  }

  try {
    const user = await prisma.user.update({ where: { id: userId }, data: { username } });
    res.json(toAuthUser(user));
  } catch {
    // Unique-constraint race between the check above and this write.
    res.status(409).json({ error: 'Username is already taken.' });
  }
});

authRouter.post('/change-password', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  const { currentPassword, newPassword } = req.body ?? {};
  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    newPassword.length < MIN_PASSWORD_LENGTH
  ) {
    res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.status(204).end();
});

authRouter.get('/me', async (req, res) => {
  const userId = getSessionUserId(req);

  if (!userId) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  res.json(toAuthUser(user));
});
