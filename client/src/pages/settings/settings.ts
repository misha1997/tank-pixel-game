import type { AuthUser } from '@tank/shared';
import { navigate } from '../../core/router.js';
import { mountPartial } from '../../core/page.js';
import { loadProfile, saveProfileColor } from '../../core/profile.js';
import { isSoundMuted, setSoundMuted } from '../../game/audio.js';
import {
  BINDABLE_ACTIONS,
  findConflict,
  getAllBindings,
  isKeyCodeBindable,
  keyLabel,
  resetBindings,
  setBinding,
  type BindableAction,
} from '../../core/keybindings.js';
import { rebuildMovementKeys } from '../../core/inputState.js';
import html from './settings.html?raw';

let wired = false;
let listeningFor: BindableAction | null = null;

const CONTROLS_HINT_DEFAULT = 'Arrow keys and Space always work too.';

function renderControls(): void {
  const bindings = getAllBindings();
  for (const action of BINDABLE_ACTIONS) {
    const btn = document.querySelector<HTMLButtonElement>(
      `#settings-controls button[data-action="${action}"]`,
    );
    if (btn) {
      btn.textContent = keyLabel(bindings[action]);
      btn.classList.remove('listening');
    }
  }
}

function wireOnce(): void {
  const colorOptions = document.querySelectorAll<HTMLElement>('#settings-colors .color-option');
  colorOptions.forEach((option) => {
    option.addEventListener('click', () => {
      colorOptions.forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');
      saveProfileColor(option.dataset.color!);
    });
  });

  const soundGroup = document.getElementById('settings-sound') as HTMLElement;
  soundGroup.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const muted = btn.dataset.value === 'off';
      setSoundMuted(muted);
      soundGroup
        .querySelectorAll('button')
        .forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  const controlsHint = document.getElementById('settings-controls-hint') as HTMLElement;
  const controlButtons = document.querySelectorAll<HTMLButtonElement>(
    '#settings-controls button[data-action]',
  );

  controlButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      listeningFor = btn.dataset.action as BindableAction;
      controlButtons.forEach((b) => b.classList.toggle('listening', b === btn));
      btn.textContent = '...';
      controlsHint.textContent = 'Press a key (Esc to cancel)…';
    });
  });

  document.getElementById('settings-controls-reset')?.addEventListener('click', () => {
    resetBindings();
    rebuildMovementKeys();
    renderControls();
    controlsHint.textContent = CONTROLS_HINT_DEFAULT;
  });

  document.addEventListener('keydown', (event) => {
    if (!listeningFor) return;
    event.preventDefault();
    const action = listeningFor;

    if (event.key === 'Escape') {
      listeningFor = null;
      renderControls();
      controlsHint.textContent = CONTROLS_HINT_DEFAULT;
      return;
    }

    if (!isKeyCodeBindable(event.keyCode)) {
      controlsHint.textContent = 'That key is reserved (arrows/Enter always work) — try another.';
      return;
    }

    const conflict = findConflict(event.keyCode, action);
    if (conflict) {
      controlsHint.textContent = `That key is already used for "${conflict}" — try another.`;
      return;
    }

    setBinding(action, event.keyCode);
    rebuildMovementKeys();
    listeningFor = null;
    renderControls();
    controlsHint.textContent = CONTROLS_HINT_DEFAULT;
  });

  document
    .getElementById('settings-account-btn')
    ?.addEventListener('click', () => navigate('/account'));
  document.getElementById('settings-back-btn')?.addEventListener('click', () => navigate('/'));
}

export function showGameSettings(account: AuthUser | null): void {
  if (!wired) {
    mountPartial(html);
    wireOnce();
    wired = true;
  }

  const overlay = document.getElementById('settings-overlay') as HTMLElement;
  const colorOptions = document.querySelectorAll<HTMLElement>('#settings-colors .color-option');

  const savedColor = loadProfile(account).color;
  colorOptions.forEach((option) => {
    option.classList.toggle('selected', option.dataset.color === savedColor);
  });

  const muted = isSoundMuted();
  document
    .querySelectorAll('#settings-sound button')
    .forEach((btn) =>
      btn.setAttribute(
        'aria-pressed',
        String((btn as HTMLElement).dataset.value === (muted ? 'off' : 'on')),
      ),
    );

  renderControls();
  const controlsHint = document.getElementById('settings-controls-hint');
  if (controlsHint) controlsHint.textContent = CONTROLS_HINT_DEFAULT;

  overlay.classList.remove('hidden');
}

export function hideGameSettings(): void {
  listeningFor = null;
  document.getElementById('settings-overlay')?.classList.add('hidden');
}
