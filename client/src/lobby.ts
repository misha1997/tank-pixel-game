import type { AuthUser, BotDifficulty, GameMode, RoomSummary, RoomVisibility } from '@tank/shared';
import { socket } from './socket.js';
import { fetchMaps } from './maps.js';
import { navigate } from './router.js';

let currentAccount: AuthUser | null = null;
let wired = false;

function selectedToggle(group: HTMLElement): string {
  return group.querySelector<HTMLElement>('.selected')?.dataset.value ?? '';
}

function wireToggleGroup(group: HTMLElement): void {
  group.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('button').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
}

async function refreshMapOptions(): Promise<void> {
  const createModeGroup = document.getElementById('lobby-create-mode') as HTMLElement;
  const createMapSelect = document.getElementById('lobby-create-map') as HTMLSelectElement;
  const mode = (selectedToggle(createModeGroup) || 'pvp') as GameMode;
  const { builtin, public: publicMaps, mine } = await fetchMaps(mode);

  createMapSelect.replaceChildren();
  for (const map of builtin) {
    const option = document.createElement('option');
    option.value = map.id;
    option.textContent = `${map.name} (Built-in)`;
    createMapSelect.appendChild(option);
  }
  for (const map of mine) {
    const option = document.createElement('option');
    option.value = map.id;
    option.textContent = `${map.name} (Mine)`;
    createMapSelect.appendChild(option);
  }
  for (const map of publicMaps) {
    if (mine.some((m) => m.id === map.id)) continue;
    const option = document.createElement('option');
    option.value = map.id;
    option.textContent = `${map.name} (by ${map.ownerName ?? 'someone'})`;
    createMapSelect.appendChild(option);
  }
}

function updateBotFillVisibility(): void {
  const createModeGroup = document.getElementById('lobby-create-mode') as HTMLElement;
  const botFillRow = document.getElementById('lobby-bot-fill-row') as HTMLElement;
  const mode = (selectedToggle(createModeGroup) || 'pvp') as GameMode;
  botFillRow.classList.toggle('tool-hidden', mode !== 'pvp');
}

function renderRooms(rooms: RoomSummary[]): void {
  const listEl = document.getElementById('lobby-room-list') as HTMLElement;
  listEl.replaceChildren();

  if (rooms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'lobby-empty';
    empty.textContent = 'No public rooms right now — create one!';
    listEl.appendChild(empty);
    return;
  }

  for (const room of rooms) {
    const row = document.createElement('div');
    row.className = 'lobby-room-row';

    const name = document.createElement('span');
    name.className = 'lobby-room-name';
    name.textContent = room.name;

    const mode = document.createElement('span');
    mode.className = 'lobby-room-mode';
    mode.textContent = room.mode === 'coop' ? 'Co-op' : 'PvP';

    const players = document.createElement('span');
    players.className = 'lobby-room-players';
    players.textContent = `${room.playerCount}/${room.maxPlayers}`;

    const status = document.createElement('span');
    status.className = `lobby-room-status lobby-room-status--${room.status}`;
    status.textContent = room.status === 'playing' ? 'In Progress' : 'Waiting';

    const joinBtn = document.createElement('button');
    joinBtn.type = 'button';
    joinBtn.className = 'lobby-join-btn';
    joinBtn.textContent = 'Join';
    joinBtn.addEventListener('click', () => navigate(`/room/${room.code}`));

    row.append(name, mode, players, status, joinBtn);
    listEl.appendChild(row);
  }
}

function wireOnce(): void {
  const createForm = document.getElementById('lobby-create-form') as HTMLFormElement;
  const createNameInput = document.getElementById('lobby-create-name') as HTMLInputElement;
  const createModeGroup = document.getElementById('lobby-create-mode') as HTMLElement;
  const createVisibilityGroup = document.getElementById('lobby-create-visibility') as HTMLElement;
  const createMapSelect = document.getElementById('lobby-create-map') as HTMLSelectElement;
  const createDifficultyGroup = document.getElementById('lobby-create-difficulty') as HTMLElement;
  const botFillInput = document.getElementById('lobby-bot-fill') as HTMLInputElement;
  const joinForm = document.getElementById('lobby-join-form') as HTMLFormElement;
  const joinCodeInput = document.getElementById('lobby-join-code') as HTMLInputElement;
  const errorBox = document.getElementById('lobby-error') as HTMLElement;
  const editorBtn = document.getElementById('lobby-editor-btn') as HTMLButtonElement;
  const leaderboardBtn = document.getElementById('lobby-leaderboard-btn') as HTMLButtonElement;

  wireToggleGroup(createModeGroup);
  wireToggleGroup(createVisibilityGroup);
  wireToggleGroup(createDifficultyGroup);
  createModeGroup.addEventListener('click', () => {
    refreshMapOptions();
    updateBotFillVisibility();
  });

  editorBtn.addEventListener('click', () => navigate('/editor'));
  leaderboardBtn.addEventListener('click', () => navigate('/leaderboard'));

  createForm.addEventListener('submit', (event) => {
    event.preventDefault();
    errorBox.textContent = '';

    const name = createNameInput.value.trim() || `${currentAccount?.username ?? 'Guest'}'s Room`;
    const mode = (selectedToggle(createModeGroup) || 'pvp') as GameMode;
    const visibility = (selectedToggle(createVisibilityGroup) || 'public') as RoomVisibility;
    const mapId = createMapSelect.value || undefined;
    const botDifficulty = (selectedToggle(createDifficultyGroup) || 'normal') as BotDifficulty;
    const botFillTarget = mode === 'pvp' ? Number(botFillInput.value) || 0 : undefined;

    socket.emit('lobby:create', { name, mode, visibility, mapId, botDifficulty, botFillTarget }, (result) => {
      if (!result.ok) {
        errorBox.textContent = result.error;
        return;
      }
      navigate(`/room/${result.room.code}`);
    });
  });

  joinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = joinCodeInput.value.trim();
    if (!code) return;
    navigate(`/room/${code}`);
  });
}

export function showLobby(account: AuthUser | null): void {
  currentAccount = account;

  if (!wired) {
    wireOnce();
    wired = true;
  }

  const overlay = document.getElementById('lobby-overlay') as HTMLElement;
  const accountStatus = document.getElementById('lobby-account-status') as HTMLElement;
  const errorBox = document.getElementById('lobby-error') as HTMLElement;

  accountStatus.textContent = account ? `Playing as ${account.username}` : 'Playing as Guest';
  errorBox.textContent = '';
  overlay.classList.remove('hidden');

  updateBotFillVisibility();
  refreshMapOptions();

  socket.on('lobby:rooms', renderRooms);
  socket.emit('lobby:subscribe');
}

export function hideLobby(): void {
  socket.emit('lobby:unsubscribe');
  socket.off('lobby:rooms', renderRooms);
  document.getElementById('lobby-overlay')?.classList.add('hidden');
}
