import { navigate } from './router.js';
import { showSettingsModal } from './settingsModal.js';

const MOBILE_QUERY = '(max-width: 900px)';
const mq = window.matchMedia(MOBILE_QUERY);

export function isMobileLayout(): boolean {
  return mq.matches;
}

function move(node: HTMLElement | null, parent: HTMLElement | null): void {
  if (node && parent && node.parentElement !== parent) {
    parent.appendChild(node);
  }
}

// The roster body, minimap canvas, and chat log/form are single DOM nodes
// shared between the desktop sidebar and their mobile homes (dock/modals) —
// relocating them preserves canvas state and avoids duplicate event wiring.
function relayout(): void {
  const minimap = document.getElementById('minimap-canvas');
  const roster = document.getElementById('match-status-body');
  const chatLog = document.getElementById('chat-log');
  const chatForm = document.getElementById('chat-form');

  if (mq.matches) {
    move(minimap, document.getElementById('modal-minimap-host'));
    move(roster, document.getElementById('modal-roster-host'));
    const dock = document.getElementById('chat-dock');
    if (dock) {
      // Keep original desktop order (log above form).
      if (chatForm) dock.appendChild(chatForm);
      if (chatLog) dock.prepend(chatLog);
    }
  } else {
    closeMobileModals();
    move(minimap, document.getElementById('side-map-panel'));
    move(roster, document.getElementById('side-roster-panel'));
    const panel = document.getElementById('chat-panel');
    if (panel) {
      if (chatForm) panel.appendChild(chatForm);
      if (chatLog) panel.insertBefore(chatLog, chatForm);
    }
  }
}

export function openMobileModal(which: 'map' | 'players'): void {
  closeMobileModals();
  const modal = document.getElementById(which === 'map' ? 'map-modal' : 'players-modal');
  modal?.classList.remove('hidden');
}

export function closeMobileModals(): void {
  document.getElementById('map-modal')?.classList.add('hidden');
  document.getElementById('players-modal')?.classList.add('hidden');
}

export function toggleChatDockCollapsed(): void {
  document.getElementById('chat-dock')?.classList.toggle('collapsed');
}

let wired = false;

export function initMobileLayout(): void {
  if (wired) return;
  wired = true;

  mq.addEventListener('change', relayout);
  relayout();

  document.getElementById('mc-map-toggle')?.addEventListener('click', () => openMobileModal('map'));
  document.getElementById('mc-players-toggle')?.addEventListener('click', () => openMobileModal('players'));
  document.getElementById('mc-chat-toggle')?.addEventListener('click', toggleChatDockCollapsed);
  document.getElementById('mc-settings-toggle')?.addEventListener('click', () => showSettingsModal());
  document.getElementById('mc-exit')?.addEventListener('click', () => navigate('/'));

  for (const id of ['map-modal', 'players-modal']) {
    const modal = document.getElementById(id);
    if (!modal) continue;

    // Tap on the dark backdrop closes; taps inside the box do not.
    modal.addEventListener('pointerdown', (event) => {
      if (event.target === modal) closeMobileModals();
    });
    for (const btn of Array.from(modal.querySelectorAll<HTMLElement>('[data-close-modal]'))) {
      btn.addEventListener('click', closeMobileModals);
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMobileModals();
  });
}
