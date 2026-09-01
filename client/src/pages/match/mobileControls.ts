import type { GameStateSnapshot } from '@tank/shared';
import { socket } from '../../core/socket.js';
import { playSound } from '../../game/audio.js';
import {
  DPAD_CODES,
  queueMovementPress,
  trackMovementKeyDown,
  trackMovementKeyUp,
  type MovementInput,
} from '../../core/inputState.js';

const AUTOFIRE_INTERVAL = 250;

interface InitOptions {
  getPlayerId: () => string | null;
  getSnapshot: () => GameStateSnapshot | null;
}

export function initMobileControls(options: InitOptions): void {
  // D-pad: press-and-hold streams via the shared held-key stack (latest
  // direction wins), plus one immediate throttled step on touch-down so the
  // tank reacts without waiting for the poll tick.
  for (const btn of Array.from(
    document.querySelectorAll<HTMLButtonElement>('#mobile-controls [data-move]'),
  )) {
    const direction = btn.dataset.move as MovementInput;
    const pseudoCode = DPAD_CODES[direction];

    btn.addEventListener('pointerdown', (event: PointerEvent) => {
      event.preventDefault();
      btn.setPointerCapture(event.pointerId);
      trackMovementKeyDown(pseudoCode);
      queueMovementPress(direction);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      btn.addEventListener(type, () => trackMovementKeyUp(pseudoCode));
    }
  }

  // FIRE: shot on touch-down, then hold-to-autofire.
  const fireBtn = document.getElementById('mc-fire');
  let fireTimer: number | null = null;

  const canShoot = (): boolean => {
    const snapshot = options.getSnapshot();
    const playerId = options.getPlayerId();
    if (!snapshot || !playerId) return false;
    const me = snapshot.players[playerId];
    return !!me && Date.now() >= me.respawnShootingCooldown;
  };

  const shoot = (): void => {
    if (canShoot()) {
      socket.emit('moveShot');
      playSound('shot');
    }
  };

  fireBtn?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (fireTimer !== null) return;
    fireBtn.setPointerCapture(event.pointerId);
    shoot();
    fireTimer = window.setInterval(shoot, AUTOFIRE_INTERVAL);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    fireBtn?.addEventListener(type, () => {
      if (fireTimer !== null) {
        clearInterval(fireTimer);
        fireTimer = null;
      }
    });
  }
}
