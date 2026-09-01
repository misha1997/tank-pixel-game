import type { BotDifficulty, MapSummary, RoomSummary } from '@tank/shared';
import { socket } from '../../core/socket.js';
import { fetchMaps } from '../../shared/maps.js';
import { createMapCard } from '../../shared/mapCard.js';

let wired = false;
let modalOpen = false;
let currentRoom: RoomSummary | null = null;
let currentIsHost = false;
let maps: MapSummary[] = [];

const draft = {
  mapId: '',
  botDifficulty: 'normal' as BotDifficulty,
  botFillTarget: 0,
};

function setPressed(group: HTMLElement, value: string): void {
  group
    .querySelectorAll<HTMLElement>('button')
    .forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.value === value)));
}

async function renderMaps(): Promise<void> {
  if (!currentRoom) return;
  const { builtin, public: publicMaps, mine } = await fetchMaps(currentRoom.mode);
  maps = [...builtin, ...mine, ...publicMaps];

  const grid = document.getElementById('settings-modal-maps') as HTMLElement;
  grid.replaceChildren();

  const seen = new Set<string>();
  for (const map of maps) {
    if (seen.has(map.id)) continue;
    seen.add(map.id);

    const card = createMapCard({
      map,
      selected: map.id === draft.mapId,
      disabled: !currentIsHost,
      onSelect: (m, cardEl) => {
        if (!currentIsHost) return;
        draft.mapId = m.id;
        grid
          .querySelectorAll('.card')
          .forEach((c) => c.setAttribute('aria-pressed', String(c === cardEl)));
      },
    });

    grid.appendChild(card);
  }
}

function render(): void {
  if (!currentRoom) return;

  draft.mapId = currentRoom.mapId;
  draft.botDifficulty = currentRoom.botDifficulty;
  draft.botFillTarget = currentRoom.botFillTarget;

  const note = document.getElementById('settings-modal-note') as HTMLElement;
  note.textContent = currentIsHost
    ? 'Changes apply immediately and start a new match.'
    : 'Only the host can change these settings.';

  const difficultyGroup = document.getElementById('settings-modal-difficulty') as HTMLElement;
  setPressed(difficultyGroup, draft.botDifficulty);
  difficultyGroup
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((btn) => (btn.disabled = !currentIsHost));

  const fillRow = document.getElementById('settings-modal-fill-row') as HTMLElement;
  const fillLabel = document.getElementById('settings-modal-fill-label') as HTMLElement;
  const isPvp = currentRoom.mode === 'pvp';
  fillRow.classList.toggle('tool-hidden', !isPvp);
  fillLabel.classList.toggle('tool-hidden', !isPvp);

  const fillInput = document.getElementById('settings-modal-fill') as HTMLInputElement;
  fillInput.value = String(draft.botFillTarget);
  fillInput.disabled = !currentIsHost;
  (document.getElementById('settings-modal-fill-minus') as HTMLButtonElement).disabled =
    !currentIsHost;
  (document.getElementById('settings-modal-fill-plus') as HTMLButtonElement).disabled =
    !currentIsHost;

  const saveBtn = document.getElementById('settings-modal-save') as HTMLButtonElement;
  saveBtn.classList.toggle('tool-hidden', !currentIsHost);

  (document.getElementById('settings-modal-error') as HTMLElement).textContent = '';

  renderMaps();
}

function wireOnce(): void {
  const difficultyGroup = document.getElementById('settings-modal-difficulty') as HTMLElement;
  difficultyGroup.addEventListener('click', (event) => {
    if (!currentIsHost) return;
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!btn) return;
    draft.botDifficulty = (btn.dataset.value ?? 'normal') as BotDifficulty;
    setPressed(difficultyGroup, draft.botDifficulty);
  });

  const fillInput = document.getElementById('settings-modal-fill') as HTMLInputElement;
  const clampFill = (value: number) => Math.min(8, Math.max(0, value || 0));
  const setFill = (value: number) => {
    draft.botFillTarget = clampFill(value);
    fillInput.value = String(draft.botFillTarget);
  };
  (document.getElementById('settings-modal-fill-minus') as HTMLButtonElement).addEventListener(
    'click',
    () => setFill(draft.botFillTarget - 1),
  );
  (document.getElementById('settings-modal-fill-plus') as HTMLButtonElement).addEventListener(
    'click',
    () => setFill(draft.botFillTarget + 1),
  );
  fillInput.addEventListener('input', () => setFill(parseInt(fillInput.value, 10)));

  document
    .getElementById('settings-modal-close')
    ?.addEventListener('click', () => hideSettingsModal());
  document.getElementById('settings-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) hideSettingsModal();
  });

  document.getElementById('settings-modal-save')?.addEventListener('click', () => {
    if (!currentIsHost) return;
    const errorBox = document.getElementById('settings-modal-error') as HTMLElement;
    errorBox.textContent = '';

    socket.emit(
      'room:updateSettings',
      {
        mapId: draft.mapId || undefined,
        botDifficulty: draft.botDifficulty,
        botFillTarget: draft.botFillTarget,
      },
      (result) => {
        if (!result.ok) {
          errorBox.textContent = result.error;
          return;
        }
        hideSettingsModal();
      },
    );
  });
}

// Called whenever this client learns the room's current settings (on join,
// and again on every 'room:restarted' broadcast) so the modal always reflects
// reality even if it wasn't open when settings last changed.
export function setSettingsContext(room: RoomSummary, isHost: boolean): void {
  currentRoom = room;
  currentIsHost = isHost;
  if (modalOpen) render();
}

export function showSettingsModal(): void {
  if (!currentRoom) return;

  if (!wired) {
    wireOnce();
    wired = true;
  }

  modalOpen = true;
  render();
  document.getElementById('settings-modal')?.classList.remove('hidden');
}

export function hideSettingsModal(): void {
  modalOpen = false;
  document.getElementById('settings-modal')?.classList.add('hidden');
}
