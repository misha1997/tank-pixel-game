import type { GameStateSnapshot } from '@tank/shared';
import { socket } from './socket.js';
import View from './view.js';
import { initMenu } from './menu.js';
import { initAuth } from './auth.js';
import { initLobby } from './lobby.js';
import { initRoster } from './roster.js';
import { initChat, isTypingIntoField } from './chat.js';

const root = document.querySelector<HTMLElement>('#root')!;

function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

const kickedNotice = sessionStorage.getItem('kickedNotice');
if (kickedNotice) {
  sessionStorage.removeItem('kickedNotice');
  showToast('You were removed from that room by the host.');
}

let myPlayerId: string | null = null;
const keyStates: Record<number, boolean> = {};
let lastInputTime = 0;
const INPUT_THROTTLE = 100;
let view: View | null = null;

type MovementInput = 'movePieceTop' | 'movePieceBottom' | 'movePieceLeft' | 'movePieceRight';
let inputQueue: { type: MovementInput; timestamp: number }[] = [];
let lastInputSent = 0;
let lastState: GameStateSnapshot | null = null;
const debugMode = window.location.search.includes('debug');
let renderedFrames = 0;

initAuth((account) => {
  initLobby(account, (room) => {
    initRoster(room);
    initChat();
    initMenu(({ name, color }) => {
      view = new View(root);
      socket.emit('new player', { name, color, roomId: room.id, rating: account?.rating, userId: account?.id });
      console.log('Game started with name:', name, ', color:', color, ', room:', room.name);
    }, account, room);
  });
});

socket.on('room:kicked', () => {
  sessionStorage.setItem('kickedNotice', '1');
  location.reload();
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
  const canSendInput = now - lastInputTime >= INPUT_THROTTLE;

  if (lastState && myPlayerId && lastState.players[myPlayerId]) {
    const myPlayer = lastState.players[myPlayerId];
    if (myPlayer.exploding && now < myPlayer.explosionEndTime) {
      return;
    }
  }

  switch (event.keyCode) {
    case 37: // Left arrow
    case 65: // A
      if (canSendInput) {
        queueInput('movePieceLeft');
        lastInputTime = now;
      }
      break;
    case 38: // Up arrow
    case 87: // W
      if (canSendInput) {
        queueInput('movePieceTop');
        lastInputTime = now;
      }
      break;
    case 39: // Right arrow
    case 68: // D
      if (canSendInput) {
        queueInput('movePieceRight');
        lastInputTime = now;
      }
      break;
    case 40: // Down arrow
    case 83: // S
      if (canSendInput) {
        queueInput('movePieceBottom');
        lastInputTime = now;
      }
      break;
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

function queueInput(inputType: MovementInput): void {
  const now = Date.now();

  inputQueue = inputQueue.filter((input) => input.type !== inputType);
  inputQueue.push({ type: inputType, timestamp: now });

  if (now - lastInputSent > 50) {
    sendInputBatch();
  }
}

function sendInputBatch(): void {
  if (inputQueue.length === 0) return;

  lastInputSent = Date.now();

  const latestInputs: Partial<Record<MovementInput, true>> = {};
  for (const input of inputQueue) {
    latestInputs[input.type] = true;
  }

  for (const type of Object.keys(latestInputs) as MovementInput[]) {
    socket.emit(type);
  }

  inputQueue = [];
}

document.addEventListener('keyup', (event) => {
  keyStates[event.keyCode] = false;
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
    view.render(lastState, myPlayerId);
    if (debugMode) renderedFrames++;
  }
  requestAnimationFrame(renderLoop);
}
renderLoop();

setInterval(() => {
  if (inputQueue.length > 0) {
    sendInputBatch();
  }
}, 50);

socket.on('state', (data) => {
  lastState = data;
});

socket.on('game mode', (data) => {
  console.log('Game mode:', data.mode, 'Wave:', data.wave);
});

socket.on('brick destroyed', (data) => {
  console.log('Brick destroyed at:', data.x, data.y);
});

socket.on('base hit', (data) => {
  console.log('Base hit! Health:', data.health);
  if (data.health <= 0) {
    alert('BASE DESTROYED! Game Over!');
  }
});

socket.on('wave complete', (data) => {
  console.log('Wave', data.wave, 'completed!');
  alert(`Wave ${data.wave} completed! Get ready for the next wave!`);
});

socket.on('game over', (data) => {
  console.log('Game Over:', data);
  alert(`GAME OVER!\nWave: ${data.wave}\nEnemies killed: ${data.kills}`);
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
