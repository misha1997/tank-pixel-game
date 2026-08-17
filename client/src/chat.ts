import type { ChatMessage } from '@tank/shared';
import { socket } from './socket.js';

const MAX_ROWS = 60;
let wired = false;
let active = false;

function appendMessage(msg: ChatMessage): void {
  if (!active) return;
  const log = document.getElementById('chat-log') as HTMLElement;

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

export function showChat(): void {
  active = true;
  const panel = document.getElementById('chat-panel') as HTMLElement;
  const log = document.getElementById('chat-log') as HTMLElement;
  panel.classList.remove('hidden');
  log.replaceChildren();

  if (!wired) {
    socket.on('chat:history', (messages) => {
      if (!active) return;
      log.replaceChildren();
      messages.forEach(appendMessage);
    });
    socket.on('chat:message', appendMessage);

    const form = document.getElementById('chat-form') as HTMLFormElement;
    const input = document.getElementById('chat-input') as HTMLInputElement;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      socket.emit('chat:send', text);
      input.value = '';
      input.blur();
    });

    wired = true;
  }
}

export function hideChat(): void {
  active = false;
  const panel = document.getElementById('chat-panel') as HTMLElement;
  panel.classList.add('hidden');
  (document.getElementById('chat-log') as HTMLElement).replaceChildren();
}

export function isTypingIntoField(): boolean {
  const activeEl = document.activeElement;
  return activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement;
}
