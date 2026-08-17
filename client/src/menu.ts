import type { GameMode } from '@tank/shared';

export interface StartGamePayload {
  name: string;
  color: string;
  mode: GameMode;
}

export function initMenu(onStart: (payload: StartGamePayload) => void): void {
  const menuOverlay = document.getElementById('menu-overlay') as HTMLElement;
  const playerNameInput = document.getElementById('player-name') as HTMLInputElement;
  const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  const colorOptions = document.querySelectorAll<HTMLElement>('.color-option');
  const modeButtons = document.querySelectorAll<HTMLButtonElement>('.mode-btn');

  const savedName = localStorage.getItem('playerName') || '';
  const savedColor = localStorage.getItem('playerColor') || '#00AA00';
  playerNameInput.value = savedName;
  playerNameInput.focus();

  colorOptions.forEach((option) => {
    if (option.dataset.color === savedColor) {
      option.classList.add('selected');
    }
    option.addEventListener('click', () => {
      colorOptions.forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');
    });
  });

  let selectedMode = (localStorage.getItem('gameMode') as GameMode) || 'pvp';

  modeButtons.forEach((btn) => {
    if (btn.dataset.mode === selectedMode) {
      btn.classList.add('selected');
      btnStart.disabled = false;
    }
    btn.addEventListener('click', () => {
      modeButtons.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedMode = btn.dataset.mode as GameMode;
      btnStart.disabled = false;
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
    localStorage.setItem('gameMode', selectedMode);

    menuOverlay.classList.add('hidden');

    onStart({ name, color: selectedColor, mode: selectedMode });
  }

  btnStart.addEventListener('click', startGame);
  playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      startGame();
    }
  });
}
