import type { BotDifficulty, GameMode, MapSummary, RoomVisibility } from '@tank/shared';
import { socket } from '../../core/socket.js';
import { navigate } from '../../core/router.js';
import { mountPartial } from '../../core/page.js';
import { fetchMaps, deleteMap } from '../../shared/maps.js';
import { createMapCard } from '../../shared/mapCard.js';
import html from './createRoom.html?raw';

type MapScope = 'all' | 'mine';

const state = {
  mapId: '',
  mode: 'pvp' as GameMode,
  visibility: 'public' as RoomVisibility,
  difficulty: 'normal' as BotDifficulty,
  fill: 3,
  mapScope: 'all' as MapScope,
};

let wired = false;
let maps: MapSummary[] = [];

function segment(id: string, onSelect: (value: string) => void): void {
  const box = document.getElementById(id) as HTMLElement;
  box.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!btn || !box.contains(btn)) return;
    Array.from(box.children).forEach((child) =>
      child.setAttribute('aria-pressed', String(child === btn)),
    );
    onSelect(btn.dataset.value ?? '');
  });
}

function updateFillVisibility(): void {
  const row = document.getElementById('create-room-fill-row') as HTMLElement;
  const label = document.getElementById('create-room-fill-label') as HTMLElement;
  const hide = state.mode === 'coop';
  row.classList.toggle('tool-hidden', hide);
  label.classList.toggle('tool-hidden', hide);
}

async function refreshMaps(): Promise<void> {
  const { builtin, public: publicMaps, mine } = await fetchMaps(state.mode);

  if (state.mapScope === 'mine') {
    maps = mine;
  } else {
    maps = [...builtin, ...mine];
    for (const map of publicMaps) {
      if (!maps.some((m) => m.id === map.id)) maps.push(map);
    }
  }

  if (!maps.some((m) => m.id === state.mapId)) {
    state.mapId = maps[0]?.id ?? '';
  }

  renderGrid();
}

function renderGrid(): void {
  const grid = document.getElementById('create-room-maps') as HTMLElement;
  grid.replaceChildren();

  for (const map of maps) {
    const card = createMapCard({
      map,
      selected: map.id === state.mapId,
      caption: (m) =>
        m.isBuiltin
          ? `${m.name} (Built-in)`
          : m.ownerName
            ? `${m.name} (by ${m.ownerName})`
            : m.name,
      onDelete:
        state.mapScope === 'mine' && !map.isBuiltin
          ? async (m) => {
              if (await deleteMap(m.id)) refreshMaps();
            }
          : undefined,
      onSelect: (m, cardEl) => {
        state.mapId = m.id;
        grid
          .querySelectorAll('.card')
          .forEach((c) => c.setAttribute('aria-pressed', String(c === cardEl)));
      },
    });

    grid.appendChild(card);
  }
}

function wireOnce(): void {
  const nameInput = document.getElementById('create-room-name') as HTMLInputElement;
  const errorBox = document.getElementById('create-room-error') as HTMLElement;
  const submitBtn = document.getElementById('create-room-submit') as HTMLButtonElement;
  const backBtn = document.getElementById('create-room-back-btn') as HTMLButtonElement;
  const newMapBtn = document.getElementById('create-room-new-map-btn') as HTMLButtonElement;
  const fillInput = document.getElementById('create-room-fill') as HTMLInputElement;
  const fillMinus = document.getElementById('create-room-fill-minus') as HTMLButtonElement;
  const fillPlus = document.getElementById('create-room-fill-plus') as HTMLButtonElement;
  const mapScopeGroup = document.getElementById('create-room-map-scope') as HTMLElement;

  segment('create-room-mode', (value) => {
    state.mode = value as GameMode;
    updateFillVisibility();
    refreshMaps();
  });
  segment('create-room-visibility', (value) => {
    state.visibility = value as RoomVisibility;
  });
  segment('create-room-difficulty', (value) => {
    state.difficulty = value as BotDifficulty;
  });
  segment('create-room-map-scope', (value) => {
    state.mapScope = value as MapScope;
    refreshMaps();
  });

  const clampFill = (value: number) => Math.min(8, Math.max(0, value || 0));
  const setFill = (value: number) => {
    state.fill = clampFill(value);
    fillInput.value = String(state.fill);
  };
  fillMinus.addEventListener('click', () => setFill(state.fill - 1));
  fillPlus.addEventListener('click', () => setFill(state.fill + 1));
  fillInput.addEventListener('input', () => setFill(parseInt(fillInput.value, 10)));

  backBtn.addEventListener('click', () => navigate('/'));
  newMapBtn.addEventListener('click', () => navigate('/editor'));

  submitBtn.addEventListener('click', () => {
    errorBox.textContent = '';
    const name =
      nameInput.value.trim() || `${localStorage.getItem('playerName') ?? 'Guest'}'s Room`;

    socket.emit(
      'lobby:create',
      {
        name,
        mode: state.mode,
        visibility: state.visibility,
        mapId: state.mapId || undefined,
        botDifficulty: state.difficulty,
        botFillTarget: state.mode === 'pvp' ? state.fill : undefined,
      },
      (result) => {
        if (!result.ok) {
          errorBox.textContent = result.error;
          return;
        }
        navigate(`/room/${result.room.code}`);
      },
    );
  });

  mapScopeGroup
    .querySelectorAll('button')
    .forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.value === 'all')));
}

export function showCreateRoom(): void {
  if (!wired) {
    mountPartial(html);
    wireOnce();
    wired = true;
  }

  document.getElementById('create-room-overlay')?.classList.remove('hidden');
  (document.getElementById('create-room-name') as HTMLInputElement).value = '';
  (document.getElementById('create-room-error') as HTMLElement).textContent = '';

  state.mapScope = 'all';
  document
    .getElementById('create-room-map-scope')
    ?.querySelectorAll('button')
    .forEach((btn) =>
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-value') === 'all')),
    );

  updateFillVisibility();
  refreshMaps();
}

export function hideCreateRoom(): void {
  document.getElementById('create-room-overlay')?.classList.add('hidden');
}
