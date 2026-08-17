import { Router } from 'express';
import type { GameMode, MapDefinition, MapListResponse, MapSummary } from '@tank/shared';
import { prisma } from '../db/prisma.js';
import { getSessionUserId } from '../auth/session.js';
import { BUILTIN_MAPS } from './builtins.js';

const MAX_CELLS = 2000; // generous upper bound on walls+bricks so a malicious payload can't balloon the DB row

function isValidMode(mode: unknown): mode is GameMode {
  return mode === 'pvp' || mode === 'coop';
}

function isValidMapDefinition(data: unknown): data is MapDefinition {
  if (!data || typeof data !== 'object') return false;
  const def = data as Partial<MapDefinition>;
  if (!Array.isArray(def.walls) || !Array.isArray(def.bricks)) return false;
  if (def.walls.length + def.bricks.length > MAX_CELLS) return false;
  const isCell = (c: unknown): boolean =>
    !!c && typeof c === 'object' && typeof (c as { x: unknown }).x === 'number' && typeof (c as { y: unknown }).y === 'number';
  return def.walls.every(isCell) && def.bricks.every(isCell);
}

export const mapsRouter = Router();

mapsRouter.get('/', async (req, res) => {
  const mode = isValidMode(req.query.mode) ? req.query.mode : undefined;
  const userId = getSessionUserId(req);

  const builtin: MapSummary[] = BUILTIN_MAPS.filter((m) => !mode || m.mode === mode).map((m) => ({
    id: m.id,
    name: m.name,
    mode: m.mode,
    visibility: 'public',
    isBuiltin: true,
    ownerName: null,
  }));

  const publicMaps = await prisma.map.findMany({
    where: { visibility: 'public', ...(mode ? { mode } : {}) },
    include: { owner: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const mineMaps = userId
    ? await prisma.map.findMany({
        where: { ownerId: userId, ...(mode ? { mode } : {}) },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const toSummary = (m: { id: string; name: string; mode: string; visibility: string; owner?: { username: string } }): MapSummary => ({
    id: m.id,
    name: m.name,
    mode: m.mode as GameMode,
    visibility: m.visibility as 'public' | 'private',
    isBuiltin: false,
    ownerName: m.owner?.username ?? null,
  });

  const response: MapListResponse = {
    builtin,
    public: publicMaps.map(toSummary),
    mine: mineMaps.map((m) => toSummary(m)),
  };
  res.json(response);
});

mapsRouter.post('/', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'You must be logged in to save maps.' });
    return;
  }

  const { name, mode, visibility, data } = req.body ?? {};

  if (typeof name !== 'string' || !name.trim() || name.length > 40) {
    res.status(400).json({ error: 'Map name must be 1-40 characters.' });
    return;
  }
  if (!isValidMode(mode)) {
    res.status(400).json({ error: 'Invalid mode.' });
    return;
  }
  if (visibility !== 'public' && visibility !== 'private') {
    res.status(400).json({ error: 'Invalid visibility.' });
    return;
  }
  if (!isValidMapDefinition(data)) {
    res.status(400).json({ error: 'Invalid map data.' });
    return;
  }

  const map = await prisma.map.create({
    data: { name: name.trim(), mode, visibility, data: data as object, ownerId: userId },
  });

  const summary: MapSummary = {
    id: map.id,
    name: map.name,
    mode: map.mode as GameMode,
    visibility: map.visibility as 'public' | 'private',
    isBuiltin: false,
    ownerName: null,
  };
  res.status(201).json(summary);
});

mapsRouter.delete('/:id', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  const map = await prisma.map.findUnique({ where: { id: req.params.id } });
  if (!map || map.ownerId !== userId) {
    res.status(404).json({ error: 'Map not found.' });
    return;
  }

  await prisma.map.delete({ where: { id: map.id } });
  res.status(204).end();
});
