import type { ArenaLayout, AuthUser, GameStateSnapshot, RoomSummary } from '@tank/shared';
import { socket } from './socket.js';
import View from './view.js';
import { initAuth } from './auth.js';
import { showLobby, hideLobby } from './lobby.js';
import { showAccountPage, hideAccountPage } from './accountPage.js';
import { loadProfile } from './profile.js';
import { showCreateRoom, hideCreateRoom } from './createRoom.js';
import { showChat, hideChat, isTypingIntoField } from './chat.js';
import { showMatchHud, hideMatchHud, updateMatchHud, showRankCard, hideRankCard } from './hud.js';
import { showMatchModal, hideMatchModal } from './matchModal.js';
import { setSettingsContext, hideSettingsModal } from './settingsModal.js';
import { showMapEditor, hideMapEditor } from './mapEditor.js';
import { registerRoute, navigate, startRouter, currentGeneration } from './router.js';
import {
  MOVEMENT_KEYS,
  queueMovementPress,
  setMovementBlockedGuard,
  startInputPipeline,
  trackMovementKeyDown,
  trackMovementKeyUp,
} from './inputState.js';
import { initMobileControls } from './mobileControls.js';
import { initMobileLayout } from './mobileLayout.js';

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

  registerRoute('/room/:code', ({ code }) => {
    const generation = currentGeneration();
    let isHost = false;

    const onRestarted = (room: RoomSummary): void => {
      setSettingsContext(room, isHost);
      hideMatchModal();
      showMatchHud(room);
      showToast('Host started a new match with updated settings.');
    };

    showMatchLoader();

    socket.emit('lobby:unsubscribe');
    socket.emit('lobby:join', { code }, (result) => {
      if (currentGeneration() !== generation) return; // navigated away while this was in flight

      if (!result.ok) {
        finishMatchLoader();
        showToast(result.error);
        navigate('/', { replace: true });
        return;
      }

      isHost = result.isHost;
      setSettingsContext(result.room, isHost);

      view = new View(root);
      showMatchHud(result.room);
      showRankCard(account);
      showChat();
      socket.on('room:restarted', onRestarted);

      // No JOIN BATTLE prompt anymore — spawn immediately with the identity
      // configured on the /account page (callsign + tank color).
      const profile = loadProfile(account);
      socket.emit('new player', {
        name: profile.name,
        color: profile.color,
        roomId: result.room.id,
        rating: account?.rating,
        userId: account?.id,
      });

      // Everything under the loader is mounted now; it lifts as soon as the
      // arena layout and the first state snapshot have arrived (see the
      // socket handlers below).
      matchLoaderAckDone = true;
      tryRevealMatch();
    });

    return () => {
      // Unconditional: the server joins the socket to the room's broadcast
      // group on 'lobby:join' *before* the ack arrives, so navigating away
      // mid-round-trip still needs the leave — joinedRoom may be null here.
      socket.emit('room:leave');
      socket.off('room:restarted', onRestarted);
      hideChat();
      hideSettingsModal();
      hideMatchHud();
      hideRankCard();
      hideMatchModal();
      finishMatchLoader();
      view = null;
      lastState = null;
      lastArena = null;
      root.replaceChildren();
    };
  });

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
    case 32: // Space
      event.preventDefault();

      if (lastState && myPlayerId && lastState.players[myPlayerId]) {
        const myPlayer = lastState.players[myPlayerId];
        if (now < myPlayer.respawnShootingCooldown) {
          return;
        }
      }

      socket.emit('moveShot');
      break;
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

socket.on('explosion', (data) => {
  console.log('Bullet collision at:', data);
});

socket.on('collision explosion', (data) => {
  console.log('Player collision at:', data);
});

function renderLoop(): void {
  if (lastState && view) {
    view.render(lastState, lastArena, myPlayerId);
    if (debugMode) renderedFrames++;
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
  updateMatchHud(data, lastArena, myPlayerId);
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
    lastArena.bricks = lastArena.bricks.filter((brick) => !(brick.x === data.x && brick.y === data.y));
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
