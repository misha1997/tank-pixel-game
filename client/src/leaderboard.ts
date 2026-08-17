import type { AuthUser, LeaderboardEntry, MatchHistoryEntry } from '@tank/shared';

async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await fetch('/api/matches/leaderboard?limit=20', { credentials: 'include' });
  if (!response.ok) return [];
  return (await response.json()) as LeaderboardEntry[];
}

async function fetchMyMatches(): Promise<MatchHistoryEntry[]> {
  const response = await fetch('/api/matches/mine', { credentials: 'include' });
  if (!response.ok) return [];
  return (await response.json()) as MatchHistoryEntry[];
}

export function initLeaderboard(account: AuthUser | null, onBack: () => void): void {
  const overlay = document.getElementById('leaderboard-overlay') as HTMLElement;
  const listEl = document.getElementById('leaderboard-list') as HTMLElement;
  const historyEl = document.getElementById('leaderboard-history') as HTMLElement;
  const backBtn = document.getElementById('leaderboard-back-btn') as HTMLButtonElement;

  overlay.classList.remove('hidden');

  async function render(): Promise<void> {
    listEl.replaceChildren();
    const entries = await fetchLeaderboard();

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lobby-empty';
      empty.textContent = 'No rated players yet.';
      listEl.appendChild(empty);
    }

    entries.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'lobby-room-row';
      if (account && entry.id === account.id) row.classList.add('leaderboard-row--me');

      const rank = document.createElement('span');
      rank.textContent = `#${index + 1}`;

      const name = document.createElement('span');
      name.className = 'lobby-room-name';
      name.textContent = entry.username;

      const rating = document.createElement('span');
      rating.textContent = `${entry.rating}`;

      row.append(rank, name, rating);
      listEl.appendChild(row);
    });

    historyEl.replaceChildren();
    if (!account) {
      const note = document.createElement('div');
      note.className = 'lobby-empty';
      note.textContent = 'Log in to track your match history.';
      historyEl.appendChild(note);
      return;
    }

    const matches = await fetchMyMatches();
    if (matches.length === 0) {
      const note = document.createElement('div');
      note.className = 'lobby-empty';
      note.textContent = 'No rated matches yet — leave a PvP room or lose a co-op defense to record one.';
      historyEl.appendChild(note);
      return;
    }

    for (const match of matches) {
      const row = document.createElement('div');
      row.className = 'lobby-room-row';

      const mode = document.createElement('span');
      mode.textContent = match.mode === 'coop' ? 'Co-op' : 'PvP';

      const map = document.createElement('span');
      map.className = 'lobby-room-name';
      map.textContent = match.mapName;

      const score = document.createElement('span');
      score.textContent = `Score ${match.score}`;

      const delta = match.ratingAfter - match.ratingBefore;
      const ratingChange = document.createElement('span');
      ratingChange.textContent = `${match.ratingBefore} → ${match.ratingAfter} (${delta >= 0 ? '+' : ''}${delta})`;
      ratingChange.className = delta >= 0 ? 'leaderboard-gain' : 'leaderboard-loss';

      row.append(mode, map, score, ratingChange);
      historyEl.appendChild(row);
    }
  }

  backBtn.addEventListener('click', () => {
    overlay.classList.add('hidden');
    onBack();
  });

  render();
}
