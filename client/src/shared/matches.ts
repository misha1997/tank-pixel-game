import type { LeaderboardEntry, MatchHistoryEntry } from '@tank/shared';

export async function fetchMyMatches(): Promise<MatchHistoryEntry[] | null> {
  const response = await fetch('/api/matches/mine', { credentials: 'include' });
  if (!response.ok) return null; // 401 for guests — treated as "no history to show"
  return (await response.json()) as MatchHistoryEntry[];
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await fetch('/api/matches/leaderboard', { credentials: 'include' });
  if (!response.ok) return [];
  return (await response.json()) as LeaderboardEntry[];
}
