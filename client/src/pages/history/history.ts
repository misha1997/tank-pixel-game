import type { LeaderboardEntry, MatchHistoryEntry } from '@tank/shared';
import { navigate } from '../../core/router.js';
import { mountPartial } from '../../core/page.js';
import { fetchLeaderboard, fetchMyMatches } from '../../shared/matches.js';
import html from './history.html?raw';

let wired = false;

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function line(text: string, className?: string): HTMLParagraphElement {
  const el = document.createElement('p');
  el.className = className ? `match-line ${className}` : 'match-line';
  el.textContent = text;
  return el;
}

function renderMatches(matches: MatchHistoryEntry[] | null): void {
  const well = document.getElementById('history-matches') as HTMLElement;
  well.replaceChildren();

  if (matches === null) {
    well.appendChild(line('Log in to track your match history.'));
    return;
  }
  if (matches.length === 0) {
    well.appendChild(line('No matches yet — go play one!'));
    return;
  }

  for (const m of matches) {
    const row = document.createElement('div');
    row.className = 'history-row';

    const modeLabel = m.mode === 'coop' ? 'Co-op' : 'PvP';
    const delta = m.ratingAfter - m.ratingBefore;
    const deltaText = delta > 0 ? `+${delta}` : String(delta);
    const outcome = m.mode === 'pvp' ? (m.won ? 'WIN' : 'LOSS') : m.won ? 'CLEARED' : 'DEFEAT';

    row.appendChild(
      line(
        `${formatDate(m.createdAt)} · ${modeLabel} · ${m.mapName} · ${formatDuration(m.durationSec)}`,
      ),
    );
    row.appendChild(
      line(
        `${outcome} — score ${m.score}, rating ${m.ratingBefore} → ${m.ratingAfter} (${deltaText})`,
        delta > 0 ? 'match-line--ok' : delta < 0 ? 'match-line--danger' : undefined,
      ),
    );

    well.appendChild(row);
  }
}

function renderLeaderboard(entries: LeaderboardEntry[]): void {
  const well = document.getElementById('history-leaderboard') as HTMLElement;
  well.replaceChildren();

  if (entries.length === 0) {
    well.appendChild(line('No rated players yet.'));
    return;
  }

  const list = document.createElement('ol');
  list.className = 'roster';
  entries.forEach((entry, index) => {
    const row = document.createElement('li');
    row.textContent = `${index + 1}. ${entry.username} — ${entry.rating}`;
    list.appendChild(row);
  });
  well.appendChild(list);
}

async function refresh(): Promise<void> {
  const [matches, leaderboard] = await Promise.all([fetchMyMatches(), fetchLeaderboard()]);
  renderMatches(matches);
  renderLeaderboard(leaderboard);
}

function wireOnce(): void {
  document.getElementById('history-back-btn')?.addEventListener('click', () => navigate('/'));
}

export function showHistory(): void {
  if (!wired) {
    mountPartial(html);
    wireOnce();
    wired = true;
  }

  document.getElementById('history-overlay')?.classList.remove('hidden');
  void refresh();
}

export function hideHistory(): void {
  document.getElementById('history-overlay')?.classList.add('hidden');
}
