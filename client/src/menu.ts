import type { AuthUser, RoomSummary } from '@tank/shared';
import { logout } from './auth.js';

export interface StartGamePayload {
  name: string;
  color: string;
}

export function initMenu(onStart: (payload: StartGamePayload) => void, account: AuthUser | null, room: RoomSummary): void {
  const menuOverlay = document.getElementById('menu-overlay') as HTMLElement;
  const playerNameInput = document.getElementById('player-name') as HTMLInputElement;
  const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  const colorOptions = document.querySelectorAll<HTMLElement>('.color-option');
  const accountStatus = document.getElementById('account-status') as HTMLElement;
  const roomInfo = document.getElementById('room-info') as HTMLElement;

  menuOverlay.classList.remove('hidden');

  if (account) {
    playerNameInput.value = account.username;
    playerNameInput.readOnly = true;
    accountStatus.textContent = `Logged in as ${account.username} (Rating: ${account.rating}) — `;
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
    if (option.dataset.color === savedColor) {
      option.classList.add('selected');
    }
    option.addEventListener('click', () => {
      colorOptions.forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');
    });
  });

  function startGame(): void {
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

    menuOverlay.classList.add('hidden');

    onStart({ name, color: selectedColor });
  }

  btnStart.addEventListener('click', startGame);
  playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      startGame();
    }
  });
}
