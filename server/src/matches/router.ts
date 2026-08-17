import { Router } from 'express';
import type { GameMode, LeaderboardEntry, MatchHistoryEntry } from '@tank/shared';
import { prisma } from '../db/prisma.js';
import { getSessionUserId } from '../auth/session.js';

export const matchesRouter = Router();

matchesRouter.get('/leaderboard', async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const users = await prisma.user.findMany({
    orderBy: { rating: 'desc' },
    take: limit,
    select: { id: true, username: true, rating: true },
  });

  const entries: LeaderboardEntry[] = users;
  res.json(entries);
});

matchesRouter.get('/mine', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  const participations = await prisma.matchParticipant.findMany({
    where: { userId },
    include: { match: true },
    orderBy: { match: { createdAt: 'desc' } },
    take: 20,
  });

  const entries: MatchHistoryEntry[] = participations.map((p) => ({
    matchId: p.matchId,
    mode: p.match.mode as GameMode,
    mapName: p.match.mapName,
    durationSec: p.match.durationSec,
    createdAt: p.match.createdAt.toISOString(),
    score: p.score,
    ratingBefore: p.ratingBefore,
    ratingAfter: p.ratingAfter,
    won: p.won,
  }));

  res.json(entries);
});
