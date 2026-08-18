import { size } from '@tank/shared';
import type { AuthUser, GameStateSnapshot, RoomSummary } from '@tank/shared';
import { navigate } from './router.js';

let wired = false;

// Ranks aren't assigned by the server yet (see AuthUser.rank in
// shared/src/types.ts) — this card only mounts once an account actually
// has one, so today it never shows. No fake/placeholder rank is displayed.
export function showRankCard(account: AuthUser | null): void {
  const card = document.getElementById('rank-card');
  if (!card) return;

  if (!account?.rank) {
    card.classList.add('hidden');
    return;
  }

  const nameEl = document.getElementById('rank-card-name');
  const rankEl = document.getElementById('rank-card-rank');
  if (nameEl) nameEl.textContent = account.username;
  if (rankEl) rankEl.textContent = account.rank;
  card.classList.remove('hidden');
}

export function hideRankCard(): void {
  document.getElementById('rank-card')?.classList.add('hidden');
}

function line(text: string, className?: string): HTMLElement {
  const el = document.createElement('p');
  el.className = className ? `match-line ${className}` : 'match-line';
  el.textContent = text;
  return el;
}

function renderCoopStatus(body: HTMLElement, data: GameStateSnapshot, myPlayerId: string | null): void {
  body.appendChild(line(`WAVE: ${data.wave || 1}`));
  body.appendChild(line(`ENEMIES: ${data.enemiesRemaining || 0}`));
  body.appendChild(line(`KILLED: ${data.enemiesKilled || 0}`));

  if (data.base) {
    const ok = data.base.health > 0;
    body.appendChild(line(`BASE: ${ok ? 'OK' : 'DESTROYED'}`, ok ? 'match-line--ok' : 'match-line--danger'));
  }

  if (data.gameState === 'defeat') {
    body.appendChild(line('GAME OVER', 'match-line--danger'));
  } else if (data.gameState === 'victory') {
    body.appendChild(line('VICTORY!', 'match-line--ok'));
  }

  const roster = document.createElement('ol');
  roster.className = 'roster';
  for (const [playerId, player] of Object.entries(data.players)) {
    if (player.isBot) continue;
    const row = document.createElement('li');
    const isMe = playerId === myPlayerId;
    const lives = '♥'.repeat(player.lives || 1);
    row.textContent = `${isMe ? '► ' : ''}${player.name}: ${lives}`;
    roster.appendChild(row);
  }
  body.appendChild(roster);
}

function renderPvpStatus(body: HTMLElement, data: GameStateSnapshot, myPlayerId: string | null): void {
  const players = Object.entries(data.players).sort((a, b) => b[1].score - a[1].score);
  body.appendChild(line(`PLAYERS: ${players.length}`));

  const roster = document.createElement('ol');
  roster.className = 'roster';
  players.forEach(([playerId, player], index) => {
    const row = document.createElement('li');
    const isMe = playerId === myPlayerId;
    const isDead = !player.status;
    const prefix = isMe ? '► ' : player.isBot ? '[BOT] ' : '';
    const status = isDead ? ' [DEAD]' : '';
    row.textContent = `${index + 1}: ${prefix}${player.name} — ${player.score}${status}`;
    roster.appendChild(row);
  });
  body.appendChild(roster);
}

function drawMinimap(data: GameStateSnapshot, myPlayerId: string | null): void {
  const canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  const cssWidth = canvas.clientWidth || canvas.width;
  const cssHeight = canvas.clientHeight || canvas.height;
  if (canvas.width !== cssWidth || canvas.height !== cssHeight) {
    canvas.width = cssWidth;
    canvas.height = cssHeight;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) return;

  const scaleX = canvas.width / size.col;
  const scaleY = canvas.height / size.row;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#b45a2a';
  for (const wall of data.walls) {
    ctx.fillRect(wall.x * scaleX, wall.y * scaleY, Math.max(2, scaleX), Math.max(2, scaleY));
  }

  if (data.bricks) {
    ctx.fillStyle = '#cc6633';
    for (const brick of data.bricks) {
      if (brick.health > 0) ctx.fillRect(brick.x * scaleX, brick.y * scaleY, Math.max(2, scaleX), Math.max(2, scaleY));
    }
  }

  if (data.base && data.base.health > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(data.base.x * scaleX, data.base.y * scaleY, scaleX * 3, scaleY * 3);
  }

  for (const [playerId, player] of Object.entries(data.players)) {
    if (!player.status) continue;

    const isMe = playerId === myPlayerId;
    const x = player.x * scaleX;
    const y = player.y * scaleY;
    const radius = isMe ? 4 : 3;

    ctx.fillStyle = player.color || (player.isBot ? '#e2603c' : '#7a3ed0');
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (isMe) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

export function updateMatchHud(data: GameStateSnapshot, myPlayerId: string | null): void {
  const body = document.getElementById('match-status-body');
  if (body) {
    body.replaceChildren();
    if (data.gameMode === 'coop') {
      renderCoopStatus(body, data, myPlayerId);
    } else {
      renderPvpStatus(body, data, myPlayerId);
    }
  }

  drawMinimap(data, myPlayerId);
}

export function showMatchHud(room: RoomSummary): void {
  const title = document.getElementById('match-status-title');
  if (title) title.textContent = `${room.name} (${room.mode === 'coop' ? 'Co-op' : 'PvP'})`;

  document.getElementById('match-status-body')?.replaceChildren();
  document.getElementById('match-hud')?.classList.remove('hidden');

  if (!wired) {
    document.getElementById('leave-match-btn')?.addEventListener('click', () => navigate('/'));
    wired = true;
  }
}

export function hideMatchHud(): void {
  document.getElementById('match-hud')?.classList.add('hidden');
  document.getElementById('match-status-body')?.replaceChildren();
}
