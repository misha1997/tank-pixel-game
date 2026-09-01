import type { AuthUser, RoomSummary } from '@tank/shared';
import { socket } from '../../core/socket.js';
import { navigate } from '../../core/router.js';
import { mountPartial } from '../../core/page.js';
import { logout } from '../auth/auth.js';
import html from './lobby.html?raw';

let wired = false;
let currentAccount: AuthUser | null = null;

function renderRooms(rooms: RoomSummary[]): void {
  const listEl = document.getElementById('lobby-room-list') as HTMLElement;
  listEl.replaceChildren();

  if (rooms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'lobby-empty o';
    empty.textContent = 'No public rooms right now — create one!';
    listEl.appendChild(empty);
    return;
  }

  for (const room of rooms) {
    const row = document.createElement('div');
    row.className = 'room';

    const name = document.createElement('span');
    name.className = 'name o';
    name.textContent = room.name;

    const meta = document.createElement('span');
    meta.className = 'meta';

    const mode = document.createElement('span');
    mode.className = 'mode o';
    mode.textContent = room.mode === 'coop' ? 'Co-op' : 'PvP';

    const count = document.createElement('span');
    count.className = 'players o';
    count.textContent = `${room.playerCount}/${room.maxPlayers} (${room.status === 'playing' ? 'In Progress' : 'Waiting'})`;

    meta.append(mode, count);

    const watchBtn = document.createElement('button');
    watchBtn.type = 'button';
    watchBtn.className = 'join watch o';
    watchBtn.textContent = 'Watch';
    watchBtn.addEventListener('click', () => navigate(`/room/${room.code}/watch`));

    const joinBtn = document.createElement('button');
    joinBtn.type = 'button';
    joinBtn.className = 'join o';
    joinBtn.textContent = 'Join';
    joinBtn.addEventListener('click', () => navigate(`/room/${room.code}`));

    row.append(name, meta, watchBtn, joinBtn);
    listEl.appendChild(row);
  }
}

function wireOnce(): void {
  const joinCodeInput = document.getElementById('lobby-join-code') as HTMLInputElement;
  const errorBox = document.getElementById('lobby-error') as HTMLElement;
  const createBtn = document.getElementById('lobby-create-btn') as HTMLButtonElement;
  const joinBtn = document.getElementById('lobby-join-btn') as HTMLButtonElement;
  const accountBtn = document.getElementById('lobby-account-btn') as HTMLButtonElement;
  const settingsBtn = document.getElementById('lobby-settings-btn') as HTMLButtonElement;
  const historyBtn = document.getElementById('lobby-history-btn') as HTMLButtonElement;
  const logoutBtn = document.getElementById('lobby-logout-btn') as HTMLButtonElement;

  createBtn.addEventListener('click', () => navigate('/create-room'));
  accountBtn.addEventListener('click', () => navigate('/account'));
  settingsBtn.addEventListener('click', () => navigate('/settings'));
  historyBtn.addEventListener('click', () => navigate('/history'));
  logoutBtn.addEventListener('click', () => {
    logout().then(() => location.reload());
  });

  const joinByCode = (): void => {
    errorBox.textContent = '';
    const code = joinCodeInput.value.trim();
    if (!code) {
      errorBox.textContent = 'Enter a room code.';
      return;
    }
    navigate(`/room/${code}`);
  };

  joinBtn.addEventListener('click', joinByCode);
  joinCodeInput.addEventListener('input', () => {
    const pos = joinCodeInput.selectionStart;
    joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    joinCodeInput.setSelectionRange(pos, pos);
  });
  joinCodeInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') joinByCode();
  });
}

export function showLobby(account: AuthUser | null): void {
  currentAccount = account;

  if (!wired) {
    mountPartial(html);
    wireOnce();
    wired = true;
  }

  const overlay = document.getElementById('lobby-overlay') as HTMLElement;
  const errorBox = document.getElementById('lobby-error') as HTMLElement;
  const accountStatus = document.getElementById('lobby-account') as HTMLElement;

  errorBox.textContent = '';
  overlay.classList.remove('hidden');

  accountStatus.textContent = currentAccount
    ? `Logged in as ${currentAccount.username} (Rating: ${currentAccount.rating})`
    : 'Playing as Guest';

  socket.on('lobby:rooms', renderRooms);
  socket.emit('lobby:subscribe');
}

export function hideLobby(): void {
  socket.emit('lobby:unsubscribe');
  socket.off('lobby:rooms', renderRooms);
  document.getElementById('lobby-overlay')?.classList.add('hidden');
}
