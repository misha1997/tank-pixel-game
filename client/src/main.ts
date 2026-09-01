import type { ArenaLayout, AuthUser, GameStateSnapshot, PowerUpState } from '@tank/shared';
import { socket } from './core/socket.js';
import View from './game/view.js';
import { playSound } from './game/audio.js';
import { initAuth } from './pages/auth/auth.js';
import { showLobby, hideLobby } from './pages/lobby/lobby.js';
import { showAccountPage, hideAccountPage } from './pages/account/accountPage.js';
import { showGameSettings, hideGameSettings } from './pages/settings/settings.js';
import { showHistory, hideHistory } from './pages/history/history.js';
import { showCreateRoom, hideCreateRoom } from './pages/create-room/createRoom.js';
import { showMapEditor, hideMapEditor } from './pages/map-editor/mapEditor.js';
import { isTypingIntoField } from './pages/match/chat.js';
import { updateMatchHud } from './pages/match/hud.js';
import { showMatchModal } from './pages/match/matchModal.js';
import { joinRoom } from './pages/match/match.js';
import { registerRoute, navigate, startRouter } from './core/router.js';
import {
  MOVEMENT_KEYS,
  queueMovementPress,
  setMovementBlockedGuard,
  startInputPipeline,
  trackMovementKeyDown,
  trackMovementKeyUp,
} from './core/inputState.js';
import { getBinding } from './core/keybindings.js';
import { initMobileControls } from './pages/match/mobileControls.js';
import { initMobileLayout } from './pages/match/mobileLayout.js';

const root = document.querySelector<HTMLElement>('#root')!;

function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

let myPlayerId: string | null = null;
const keyStates: Record<number, boolean> = {};
let view: View | null = null;

// Spectators never emit 'new player', so myPlayerId stays null for them —
// this flag is what actually gates game-input keys and drives the
// roster-click-to-follow camera (see the 'state' handler and renderLoop).
let isSpectating = false;
let spectateTargetId: string | null = null;

// Match deploy gate: while a room route is assembling (socket ack, arena
// layout, first state snapshot), the #match-loader covers the screen and is
// lifted only when everything below it is painted — so the arena, HUD,
// minimap, and chat appear in the same frame instead of popping in one by
// one. Fails open after a timeout so a stalled stream can't trap the player.
let matchLoaderActive = false;
let matchLoaderAckDone = false;
let matchLoaderTimer: number | null = null;

function finishMatchLoader(): void {
  matchLoaderActive = false;
  if (matchLoaderTimer !== null) {
    clearTimeout(matchLoaderTimer);
    matchLoaderTimer = null;
  }
  document.getElementById('match-loader')?.classList.add('hidden');
}

function tryRevealMatch(): void {
  if (!matchLoaderActive || !matchLoaderAckDone) return;
  if (!lastState || !lastArena) return;
  finishMatchLoader();
}

function showMatchLoader(): void {
  matchLoaderActive = true;
  matchLoaderAckDone = false;
  document.getElementById('match-loader')?.classList.remove('hidden');
  matchLoaderTimer = window.setTimeout(finishMatchLoader, 4000);
}

let lastState: GameStateSnapshot | null = null;
let lastArena: ArenaLayout | null = null;
const debugMode = window.location.search.includes('debug');
let renderedFrames = 0;

let activePowerUps: PowerUpState[] = [];

// Kill-cam: while set, the camera follows the killer instead of our own
// (dead) tank — see the 'killed by' handler below.
const KILL_CAM_DURATION = 1500;
let killedBy: string | null = null;
let killCamUntil = 0;

// --- Routing -----------------------------------------------------------

function setupRoutes(account: AuthUser | null): void {
  registerRoute('/', () => {
    showLobby(account);
    return () => hideLobby();
  });

  registerRoute('/create-room', () => {
    showCreateRoom();
    return () => hideCreateRoom();
  });

  registerRoute('/editor', () => {
    showMapEditor();
    return () => hideMapEditor();
  });

  registerRoute('/account', () => {
    showAccountPage(account);
    return () => hideAccountPage();
  });

  registerRoute('/settings', () => {
    showGameSettings(account);
    return () => hideGameSettings();
  });

  registerRoute('/history', () => {
    showHistory();
    return () => hideHistory();
  });

  const enterRoom = (code: string, spectate: boolean): (() => void) => {
    showMatchLoader();
    isSpectating = spectate;
    spectateTargetId = null;

    return joinRoom(
      code,
      account,
      root,
      {
        onEnter: (v) => {
          view = v;
        },
        onExit: () => {
          finishMatchLoader();
          view = null;
          lastState = null;
          lastArena = null;
          activePowerUps = [];
          killedBy = null;
          killCamUntil = 0;
          isSpectating = false;
          spectateTargetId = null;
          root.replaceChildren();
        },
        onReady: () => {
          matchLoaderAckDone = true;
          tryRevealMatch();
        },
        showToast,
      },
      spectate,
    );
  };

  registerRoute('/room/:code', ({ code }) => enterRoom(code, false));
  registerRoute('/room/:code/watch', ({ code }) => enterRoom(code, true));

  startRouter();
}

initAuth((account) => {
  setupRoutes(account);
});

socket.on('room:kicked', () => {
  showToast('You were removed from this room by the host.');
  navigate('/', { replace: true });
});

socket.on('player id', (id) => {
  myPlayerId = id;
  console.log('My player ID:', myPlayerId);
});

document.addEventListener('keydown', (event) => {
  if (!view) return;
  if (isTypingIntoField()) return;

  if (isSpectating) {
    if (event.keyCode === 13) document.getElementById('chat-input')?.focus();
    return;
  }

  if (keyStates[event.keyCode]) return;
  keyStates[event.keyCode] = true;

  const now = Date.now();

  if (lastState && myPlayerId && lastState.players[myPlayerId]) {
    const myPlayer = lastState.players[myPlayerId];
    if (myPlayer.exploding && now < myPlayer.explosionEndTime) {
      return;
    }
  }

  const movementInput = MOVEMENT_KEYS[event.keyCode];
  if (movementInput) {
    trackMovementKeyDown(event.keyCode);
    queueMovementPress(movementInput);
    return;
  }

  switch (event.keyCode) {
    case 32: // Space — always works as a fallback, even if shoot is rebound
    case getBinding('shoot'):
      event.preventDefault();

      if (lastState && myPlayerId && lastState.players[myPlayerId]) {
        const myPlayer = lastState.players[myPlayerId];
        if (now < myPlayer.respawnShootingCooldown) {
          return;
        }
      }

      socket.emit('moveShot');
      playSound('shot');
      break;
    case getBinding('switchWeapon'): {
      event.preventDefault();
      socket.emit('switchWeapon');
      const myPlayer = lastState && myPlayerId ? lastState.players[myPlayerId] : null;
      showToast(myPlayer?.weapon === 'spread' ? 'Cannon' : 'Spread Shot');
      break;
    }
    case 13: // Enter — focus chat
      document.getElementById('chat-input')?.focus();
      break;
  }
});

document.addEventListener('keyup', (event) => {
  keyStates[event.keyCode] = false;
  trackMovementKeyUp(event.keyCode);
});

socket.on('user dead', (id) => {
  if (id === myPlayerId) {
    setTimeout(() => {
      socket.emit('restart');
    }, 2000);
  }
});

socket.on('user dead sound', () => {
  playSound('dead');
});

socket.on('killed by', (killerId) => {
  if (!killerId || killerId === myPlayerId) {
    killedBy = null;
    killCamUntil = 0;
    return;
  }
  killedBy = killerId;
  killCamUntil = Date.now() + KILL_CAM_DURATION;
  const killerName = lastState?.players[killerId]?.name;
  if (killerName) showToast(`Killed by ${killerName}`);
});

socket.on('powerup:spawned', (powerUp) => {
  activePowerUps.push(powerUp);
});

socket.on('powerup:collected', (data) => {
  activePowerUps = activePowerUps.filter((p) => p.id !== data.id);
  if (data.playerId === myPlayerId) {
    showToast(data.type === 'shield' ? 'Shield activated!' : 'Rapid fire!');
  }
});

socket.on('explosion', (data) => {
  console.log('Bullet collision at:', data);
});

socket.on('collision explosion', (data) => {
  console.log('Player collision at:', data);
});

function renderLoop(): void {
  // A single bad frame (e.g. a transient bad snapshot) must not permanently
  // kill the loop — requestAnimationFrame never gets rescheduled if the
  // callback throws.
  try {
    if (lastState && view) {
      const cameraPlayerId = isSpectating
        ? spectateTargetId
        : killedBy && Date.now() < killCamUntil
          ? killedBy
          : null;
      view.render(lastState, lastArena, myPlayerId, cameraPlayerId, activePowerUps);
      if (debugMode) renderedFrames++;
    }
  } catch (err) {
    console.error('Render frame failed:', err);
  }
  requestAnimationFrame(renderLoop);
}
renderLoop();

setMovementBlockedGuard(() => {
  if (!lastState || !myPlayerId) return false;
  const me = lastState.players[myPlayerId];
  return !!me && me.exploding && Date.now() < me.explosionEndTime;
});

startInputPipeline();
initMobileControls({
  getPlayerId: () => myPlayerId,
  getSnapshot: () => lastState,
});
initMobileLayout();

socket.on('state', (data) => {
  lastState = data;

  if (isSpectating) {
    if (!spectateTargetId || !data.players[spectateTargetId]) {
      const ids = Object.keys(data.players);
      spectateTargetId = ids.find((id) => !data.players[id].isBot) ?? ids[0] ?? null;
    }
    updateMatchHud(data, lastArena, spectateTargetId, (id) => {
      spectateTargetId = id;
    });
  } else {
    updateMatchHud(data, lastArena, myPlayerId);
  }

  tryRevealMatch();
});

socket.on('arena', (layout) => {
  lastArena = layout;
  tryRevealMatch();
});

socket.on('game mode', (data) => {
  console.log('Game mode:', data.mode, 'Wave:', data.wave);
});

socket.on('brick destroyed', (data) => {
  console.log('Brick destroyed at:', data.x, data.y);
  // Apply the delta to our static arena copy — the per-tick snapshot no
  // longer carries bricks.
  if (lastArena) {
    lastArena.bricks = lastArena.bricks.filter(
      (brick) => !(brick.x === data.x && brick.y === data.y),
    );
  }
});

socket.on('base hit', (data) => {
  console.log('Base hit! Health:', data.health);
  // No modal here for a 0-health hit — the server always follows up with
  // 'game over', which is where the defeat modal is shown.
});

socket.on('wave complete', (data) => {
  console.log('Wave', data.wave, 'completed!');
  showMatchModal({
    variant: 'victory',
    kicker: 'WAVE CLEARED',
    title: `WAVE ${data.wave} COMPLETE!`,
    body: 'Get ready — the next wave is inbound...',
    autoCloseMs: 3500,
  });
});

socket.on('game over', (data) => {
  console.log('Game Over:', data);
  showMatchModal({
    variant: 'defeat',
    kicker: 'BASE DESTROYED',
    title: 'GAME OVER',
    body: `Survived to wave ${data.wave} — ${data.kills} enemies destroyed.`,
  });
});

socket.io.on('reconnect', () => {
  console.log('Reconnected to server');
  location.reload();
});

socket.on('connect_error', (error) => {
  console.log('Connection error:', error);
});

// Debug mode
if (debugMode) {
  let lastTime = Date.now();

  setInterval(() => {
    const now = Date.now();
    const fps = Math.round((renderedFrames * 1000) / (now - lastTime));
    renderedFrames = 0;
    lastTime = now;

    const debugDiv =
      document.getElementById('debug') ||
      (() => {
        const div = document.createElement('div');
        div.id = 'debug';
        div.style.cssText =
          'position:fixed;top:10px;left:10px;color:white;background:rgba(0,0,0,0.7);padding:10px;font-family:monospace;z-index:1000;';
        document.body.appendChild(div);
        return div;
      })();

    debugDiv.innerHTML = `FPS: ${fps}<br>Players: ${lastState ? Object.keys(lastState.players).length : 0}`;
  }, 1000);
}
