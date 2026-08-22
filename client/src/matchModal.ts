export type MatchModalVariant = 'victory' | 'defeat';

interface ShowMatchModalOptions {
  variant: MatchModalVariant;
  kicker?: string;
  title: string;
  body: string;
  // Auto-dismiss after this many ms (e.g. a wave-clear banner that shouldn't
  // block play while the next wave spins up server-side). Omit for a modal
  // the player has to dismiss themselves (e.g. final game over).
  autoCloseMs?: number;
}

let wired = false;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearDismissTimer(): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

function wireOnce(): void {
  if (wired) return;
  wired = true;

  document.getElementById('match-modal-btn')?.addEventListener('click', () => hideMatchModal());
  document.getElementById('match-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) hideMatchModal();
  });
}

export function showMatchModal({ variant, kicker, title, body, autoCloseMs }: ShowMatchModalOptions): void {
  const modal = document.getElementById('match-modal');
  const kickerEl = document.getElementById('match-modal-kicker');
  const titleEl = document.getElementById('match-modal-title');
  const bodyEl = document.getElementById('match-modal-body');
  if (!modal || !kickerEl || !titleEl || !bodyEl) return;

  wireOnce();
  clearDismissTimer();

  modal.classList.remove('match-modal--victory', 'match-modal--defeat');
  modal.classList.add(`match-modal--${variant}`);
  kickerEl.textContent = kicker ?? '';
  titleEl.textContent = title;
  bodyEl.textContent = body;
  modal.classList.remove('hidden');

  if (autoCloseMs) {
    dismissTimer = setTimeout(() => hideMatchModal(), autoCloseMs);
  }
}

export function hideMatchModal(): void {
  clearDismissTimer();
  document.getElementById('match-modal')?.classList.add('hidden');
}
