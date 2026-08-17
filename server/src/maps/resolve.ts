import type { GameMode, MapDefinition } from '@tank/shared';
import { prisma } from '../db/prisma.js';
import { defaultBuiltinMapFor, getBuiltinMap } from './builtins.js';

export interface ResolvedMap {
  name: string;
  definition: MapDefinition;
}

export async function resolveMap(mode: GameMode, mapId: string | undefined): Promise<ResolvedMap> {
  if (!mapId) {
    const fallback = defaultBuiltinMapFor(mode);
    return { name: fallback.name, definition: fallback.definition };
  }

  const builtin = getBuiltinMap(mapId);
  if (builtin) {
    return { name: builtin.name, definition: builtin.definition };
  }

  const custom = await prisma.map.findUnique({ where: { id: mapId } });
  if (custom) {
    return { name: custom.name, definition: custom.data as unknown as MapDefinition };
  }

  const fallback = defaultBuiltinMapFor(mode);
  return { name: fallback.name, definition: fallback.definition };
}
