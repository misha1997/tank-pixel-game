import type { GameMode, MapListResponse, SaveMapPayload, MapSummary } from '@tank/shared';

export async function fetchMaps(mode: GameMode): Promise<MapListResponse> {
  const response = await fetch(`/api/maps?mode=${mode}`, { credentials: 'include' });
  if (!response.ok) return { builtin: [], public: [], mine: [] };
  return (await response.json()) as MapListResponse;
}

export async function saveMap(payload: SaveMapPayload): Promise<{ ok: true; map: MapSummary } | { ok: false; error: string }> {
  const response = await fetch('/api/maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) return { ok: false, error: data.error || 'Could not save map.' };
  return { ok: true, map: data as MapSummary };
}
