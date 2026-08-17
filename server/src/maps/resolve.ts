import type { GameMode, MapDefinition } from '@tank/shared';
import { prisma } from '../db/prisma.js';
import { defaultBuiltinMapFor, getBuiltinMap } from './builtins.js';

export async function resolveMapDefinition(mode: GameMode, mapId: string | undefined): Promise<MapDefinition> {
  if (!mapId) {
    return defaultBuiltinMapFor(mode).definition;
  }

  const builtin = getBuiltinMap(mapId);
  if (builtin) {
    return builtin.definition;
  }

  const custom = await prisma.map.findUnique({ where: { id: mapId } });
  if (custom) {
    return custom.data as unknown as MapDefinition;
  }

  return defaultBuiltinMapFor(mode).definition;
}
