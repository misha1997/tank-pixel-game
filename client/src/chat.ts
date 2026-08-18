import type { ChatMessage } from '@tank/shared';
import { socket } from './socket.js';

const MAX_ROWS = 60;
const EMOJIS = [
  '😀', '😂', '😎', '🔥', '💥', '🎯', '🏆', '😡',
  '👍', '👎', '❤️', '💀', '🚀', '⚡', '🛡️', '🎮',
  '😱', '🙌', '👏', '🤔', '😢', '🤝', '🥳', '✨',
];
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

function insertEmoji(emoji: string): void {
  const input = document.getElementById('chat-input') as HTMLInputElement;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
  const cursor = start + emoji.length;
  input.setSelectionRange(cursor, cursor);
  input.focus();
}

function wireEmojiPicker(): void {
  const toggleBtn = document.getElementById('chat-emoji-btn') as HTMLButtonElement;
  const picker = document.getElementById('chat-emoji-picker') as HTMLElement;

  for (const emoji of EMOJIS) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'chat-emoji-option';
    option.textContent = emoji;
    option.addEventListener('click', () => insertEmoji(emoji));
    picker.appendChild(option);
  }

  toggleBtn.addEventListener('click', () => {
    picker.classList.toggle('hidden');
  });

  document.addEventListener('click', (event) => {
    if (picker.classList.contains('hidden')) return;
    const target = event.target as Node;
    if (picker.contains(target) || target === toggleBtn) return;
    picker.classList.add('hidden');
  });
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

    wireEmojiPicker();

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
