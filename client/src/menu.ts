import type { AuthUser, RoomSummary } from '@tank/shared';
import { logout } from './auth.js';
import { navigate } from './router.js';

export interface StartGamePayload {
  name: string;
  color: string;
}

let currentAccount: AuthUser | null = null;
let currentRoom: RoomSummary | null = null;
let onStartCallback: ((payload: StartGamePayload) => void) | null = null;
let wired = false;

function startGame(): void {
  const playerNameInput = document.getElementById('player-name') as HTMLInputElement;
  const colorOptions = document.querySelectorAll<HTMLElement>('.color-option');

  const name = playerNameInput.value.trim();
  const selectedOption = document.querySelector<HTMLElement>('.color-option.selected');
  const selectedColor = selectedOption ? selectedOption.dataset.color! : colorOptions[0].dataset.color!;

  if (!name) {
    playerNameInput.focus();
    playerNameInput.style.borderColor = '#ff4444';
    setTimeout(() => {
      playerNameInput.style.borderColor = '';
    }, 500);
    return;
  }

  localStorage.setItem('playerName', name);
  localStorage.setItem('playerColor', selectedColor);

  onStartCallback?.({ name, color: selectedColor });
}

function wireOnce(): void {
  const playerNameInput = document.getElementById('player-name') as HTMLInputElement;
  const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  const backBtn = document.getElementById('menu-back-btn') as HTMLButtonElement;
  const colorOptions = document.querySelectorAll<HTMLElement>('.color-option');

  colorOptions.forEach((option) => {
    option.addEventListener('click', () => {
      colorOptions.forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');
    });
  });

  btnStart.addEventListener('click', startGame);
  playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startGame();
  });
  backBtn.addEventListener('click', () => navigate('/'));
}

export function showMenu(account: AuthUser | null, room: RoomSummary, onStart: (payload: StartGamePayload) => void): void {
  currentAccount = account;
  currentRoom = room;
  onStartCallback = onStart;

  if (!wired) {
    wireOnce();
    wired = true;
  }

  const menuOverlay = document.getElementById('menu-overlay') as HTMLElement;
  const playerNameInput = document.getElementById('player-name') as HTMLInputElement;
  const colorOptions = document.querySelectorAll<HTMLElement>('.color-option');
  const accountStatus = document.getElementById('account-status') as HTMLElement;
  const roomInfo = document.getElementById('room-info') as HTMLElement;

  menuOverlay.classList.remove('hidden');
  playerNameInput.readOnly = false;
  playerNameInput.style.borderColor = '';

  accountStatus.replaceChildren();
  if (currentAccount) {
    playerNameInput.value = currentAccount.username;
    playerNameInput.readOnly = true;
    accountStatus.append(`Logged in as ${currentAccount.username} (Rating: ${currentAccount.rating}) — `);
    const logoutLink = document.createElement('a');
    logoutLink.textContent = 'Log out';
    logoutLink.addEventListener('click', () => {
      logout().then(() => location.reload());
    });
    accountStatus.appendChild(logoutLink);
  } else {
    const savedName = localStorage.getItem('playerName') || '';
    playerNameInput.value = savedName;
    playerNameInput.focus();
    accountStatus.textContent = 'Playing as Guest — progress will not be saved';
  }

  roomInfo.replaceChildren();
  const roomLine = document.createElement('div');
  roomLine.textContent = `Room: ${room.name} (${room.mode === 'coop' ? 'Co-op' : 'PvP'})`;
  roomInfo.appendChild(roomLine);
  if (room.visibility === 'private') {
    const codeLine = document.createElement('div');
    codeLine.textContent = `Invite code: ${room.code} — link: ${location.origin}/room/${room.code}`;
    roomInfo.appendChild(codeLine);
  }

  const savedColor = localStorage.getItem('playerColor') || '#00AA00';
  colorOptions.forEach((option) => {
    option.classList.toggle('selected', option.dataset.color === savedColor);
  });
}

export function hideMenu(): void {
  document.getElementById('menu-overlay')?.classList.add('hidden');
  onStartCallback = null;
  currentRoom = null;
}
