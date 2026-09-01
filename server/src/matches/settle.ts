import { prisma } from '../db/prisma.js';

const PVP_K_FACTOR = 32;
const COOP_RATING_PER_WAVE = 3;
const COOP_RATING_CAP = 40;

export async function settlePvpDeparture(params: {
  userId: string;
  ratingBefore: number;
  score: number;
  opponentAvgScore: number;
  opponentAvgRating: number | null;
  mapName: string;
  durationSec: number;
}): Promise<void> {
  if (params.opponentAvgRating === null) return; // nothing rated to compare against

  const actual =
    params.score > params.opponentAvgScore ? 1 : params.score < params.opponentAvgScore ? 0 : 0.5;
  const expected = 1 / (1 + 10 ** ((params.opponentAvgRating - params.ratingBefore) / 400));
  const delta = Math.round(PVP_K_FACTOR * (actual - expected));
  const ratingAfter = Math.max(0, params.ratingBefore + delta);

  await prisma.$transaction([
    prisma.user.update({ where: { id: params.userId }, data: { rating: ratingAfter } }),
    prisma.match.create({
      data: {
        mode: 'pvp',
        mapName: params.mapName,
        durationSec: params.durationSec,
        participants: {
          create: [
            {
              userId: params.userId,
              score: params.score,
              ratingBefore: params.ratingBefore,
              ratingAfter,
              won: actual === 1,
            },
          ],
        },
      },
    }),
  ]);
}

export async function settleCoopDefeat(params: {
  mapName: string;
  durationSec: number;
  wave: number;
  participants: { userId: string; ratingBefore: number; score: number }[];
}): Promise<void> {
  if (params.participants.length === 0) return;

  const gain = Math.min(COOP_RATING_CAP, params.wave * COOP_RATING_PER_WAVE);

  await prisma.$transaction([
    ...params.participants.map((p) =>
      prisma.user.update({ where: { id: p.userId }, data: { rating: p.ratingBefore + gain } }),
    ),
    prisma.match.create({
      data: {
        mode: 'coop',
        mapName: params.mapName,
        durationSec: params.durationSec,
        participants: {
          create: params.participants.map((p) => ({
            userId: p.userId,
            score: p.score,
            ratingBefore: p.ratingBefore,
            ratingAfter: p.ratingBefore + gain,
            won: false, // reaching this point always means the base fell
          })),
        },
      },
    }),
  ]);
}
