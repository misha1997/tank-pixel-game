import type { MapSummary } from '@tank/shared';
import { renderMapThumbnail } from '../game/mapThumbnail.js';

export interface MapCardOptions {
  map: MapSummary;
  selected: boolean;
  disabled?: boolean;
  caption?: (map: MapSummary) => string;
  onSelect?: (map: MapSummary, card: HTMLButtonElement) => void;
  onDelete?: (map: MapSummary) => void;
}

export function createMapCard({
  map,
  selected,
  disabled,
  caption,
  onSelect,
  onDelete,
}: MapCardOptions): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';
  card.disabled = !!disabled;
  card.setAttribute('aria-pressed', String(selected));

  const thumb = document.createElement('canvas');
  thumb.className = 'thumb';
  thumb.width = 96;
  thumb.height = 64;
  renderMapThumbnail(thumb, map.id, map.data);

  const captionEl = document.createElement('span');
  captionEl.className = 'cap o';
  captionEl.textContent = caption ? caption(map) : map.name;

  card.append(thumb, captionEl);

  if (onDelete) {
    const del = document.createElement('span');
    del.className = 'card-delete';
    del.textContent = '×';
    del.title = 'Delete map';
    del.addEventListener('click', (event) => {
      event.stopPropagation();
      onDelete(map);
    });
    card.appendChild(del);
  }

  if (onSelect) {
    card.addEventListener('click', () => onSelect(map, card));
  }

  return card;
}
