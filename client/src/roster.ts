import type { RoomPlayerInfo, RoomSummary } from '@tank/shared';
import { socket } from './socket.js';

export function initRoster(room: RoomSummary): void {
  const panel = document.getElementById('roster-panel') as HTMLElement;
  panel.classList.remove('hidden');

  function render(players: RoomPlayerInfo[]): void {
    panel.replaceChildren();
    if (players.length === 0) return;

    const label = document.createElement('label');
    label.textContent = `${room.name}:`;
    panel.appendChild(label);

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

  socket.on('room:players', render);
}
