import type { RoomPlayerInfo, RoomSummary } from '@tank/shared';
import { socket } from './socket.js';
import { navigate } from './router.js';

let currentRoom: RoomSummary | null = null;
let wired = false;

function render(players: RoomPlayerInfo[]): void {
  if (!currentRoom) return;
  const panel = document.getElementById('roster-panel') as HTMLElement;
  const room = currentRoom;

  panel.replaceChildren();

  const header = document.createElement('div');
  header.className = 'roster-header';

  const label = document.createElement('label');
  label.textContent = `${room.name}:`;
  header.appendChild(label);

  const leaveLink = document.createElement('a');
  leaveLink.textContent = 'Leave';
  leaveLink.addEventListener('click', () => navigate('/'));
  header.appendChild(leaveLink);

  panel.appendChild(header);

  const iAmHost = players.find((p) => p.socketId === socket.id)?.isHost ?? false;

  for (const player of players) {
    const row = document.createElement('div');
    row.className = 'roster-row';

    const name = document.createElement('span');
    name.textContent = player.isHost ? `${player.name} (host)` : player.name;
    row.appendChild(name);

    if (iAmHost && !player.isHost) {
      const kickBtn = document.createElement('button');
      kickBtn.type = 'button';
      kickBtn.className = 'roster-kick-btn';
      kickBtn.textContent = 'Kick';
      kickBtn.addEventListener('click', () => {
        socket.emit('room:kick', { roomId: room.id, targetSocketId: player.socketId });
      });
      row.appendChild(kickBtn);
    }

    panel.appendChild(row);
  }
}

export function showRoster(room: RoomSummary): void {
  currentRoom = room;

  if (!wired) {
    socket.on('room:players', render);
    wired = true;
  }

  const panel = document.getElementById('roster-panel') as HTMLElement;
  panel.classList.remove('hidden');
  panel.replaceChildren();
}

export function hideRoster(): void {
  currentRoom = null;
  const panel = document.getElementById('roster-panel') as HTMLElement;
  panel.classList.add('hidden');
  panel.replaceChildren();
}
