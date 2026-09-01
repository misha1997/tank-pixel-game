import type { GameMode, MapDefinition } from '@tank/shared';
import { prisma } from '../db/prisma.js';
import { defaultBuiltinMapFor, getBuiltinMap } from './builtins.js';

export interface ResolvedMap {
  id: string;
  name: string;
  definition: MapDefinition;
}

function staticFallback(mode: GameMode, mapId: string | undefined): ResolvedMap {
  const builtin = (mapId && getBuiltinMap(mapId)) || defaultBuiltinMapFor(mode);
  return { id: builtin.id, name: builtin.name, definition: builtin.definition };
}

// Builtin and custom maps both live in the Map table now (builtins are
// seeded via `prisma db seed`, see prisma/seed.ts). This is only ever
// called with an already-resolved id or none at all, so a single lookup
// covers both cases. Falls back to the bundled static definitions
// (builtins.ts) if the DB is unreachable or hasn't been seeded yet — rooms
// (including the always-on quick-play ones, created at server boot) must
// never fail to start just because the database had a hiccup.
export async function resolveMap(mode: GameMode, mapId: string | undefined): Promise<ResolvedMap> {
  const targetId = mapId ?? defaultBuiltinMapFor(mode).id;

  try {
    const map = await prisma.map.findUnique({ where: { id: targetId } });
    if (map) {
      return { id: map.id, name: map.name, definition: map.data as unknown as MapDefinition };
    }
  } catch (err) {
    console.error('resolveMap: database lookup failed, using bundled map data', err);
  }

  return staticFallback(mode, mapId);
}
