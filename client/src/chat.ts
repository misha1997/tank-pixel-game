import type { ChatMessage } from '@tank/shared';
import { socket } from './socket.js';

const MAX_ROWS = 60;

export function initChat(): void {
  const panel = document.getElementById('chat-panel') as HTMLElement;
  const log = document.getElementById('chat-log') as HTMLElement;
  const input = document.getElementById('chat-input') as HTMLInputElement;
  const form = document.getElementById('chat-form') as HTMLFormElement;

  panel.classList.remove('hidden');

  function appendMessage(msg: ChatMessage): void {
    const row = document.createElement('div');
    row.className = msg.system ? 'chat-row chat-row--system' : 'chat-row';

    if (msg.system) {
      row.textContent = msg.text;
    } else {
      const author = document.createElement('span');
      author.className = 'chat-author';
      author.textContent = `${msg.authorName}: `;
      row.append(author, document.createTextNode(msg.text));
    }

    log.appendChild(row);
    while (log.children.length > MAX_ROWS) log.firstChild?.remove();
    log.scrollTop = log.scrollHeight;
  }

  socket.on('chat:history', (messages) => {
    log.replaceChildren();
    messages.forEach(appendMessage);
  });
  socket.on('chat:message', appendMessage);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    socket.emit('chat:send', text);
    input.value = '';
    input.blur();
  });
}

export function isTypingIntoField(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
}
