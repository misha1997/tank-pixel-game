import type { AuthUser, RoomSummary } from '@tank/shared';
import { socket } from '../../core/socket.js';
import { currentGeneration, navigate } from '../../core/router.js';
import { mountPartial } from '../../core/page.js';
import { loadProfile } from '../../core/profile.js';
import View from '../../game/view.js';
import { playSound } from '../../game/audio.js';
import { showMatchHud, hideMatchHud, showRankCard, hideRankCard } from './hud.js';
import { showChat, hideChat } from './chat.js';
import { hideMatchModal } from './matchModal.js';
import { setSettingsContext, hideSettingsModal } from './settingsModal.js';
import html from './match.html?raw';

let wired = false;

export interface MatchCallbacks {
  /** The freshly created renderer for this match — main.ts owns rendering the game loop off it. */
  onEnter(view: View): void;
  /** Match torn down (navigated away, kicked, etc.) — main.ts clears its view/snapshot state. */
  onExit(): void;
  /** Arena + first state snapshot are in — main.ts can lift the match-loader now. */
  onReady(): void;
  showToast(message: string): void;
}

/**
 * Joins the room identified by `code` and wires up everything owned by the
 * "in a match" screen (HUD, chat, rank card, match/settings modals). Returns
 * a cleanup function for the router to call when navigating away.
 */
export function joinRoom(
  code: string,
  account: AuthUser | null,
  root: HTMLElement,
  callbacks: MatchCallbacks,
  spectate = false,
): () => void {
  if (!wired) {
    mountPartial(html);
    wired = true;
  }

  if (spectate) document.body.classList.add('spectating');

  const generation = currentGeneration();
  let isHost = false;

  const onRestarted = (room: RoomSummary): void => {
    setSettingsContext(room, isHost);
    hideMatchModal();
    showMatchHud(room);
    callbacks.showToast('Host started a new match with updated settings.');
  };

  socket.emit('lobby:unsubscribe');
  socket.emit('lobby:join', { code }, (result) => {
    if (currentGeneration() !== generation) return; // navigated away while this was in flight

    if (!result.ok) {
      callbacks.showToast(result.error);
      navigate('/', { replace: true });
      return;
    }

    isHost = result.isHost;
    setSettingsContext(result.room, isHost);
    playSound('start');

    callbacks.onEnter(new View(root));
    showMatchHud(result.room);
    if (!spectate) showRankCard(account);
    showChat();
    socket.on('room:restarted', onRestarted);

    if (!spectate) {
      // No JOIN BATTLE prompt anymore — spawn immediately with the identity
      // configured on the /account page (callsign + tank color).
      const profile = loadProfile(account);
      socket.emit('new player', {
        name: profile.name,
        color: profile.color,
        roomId: result.room.id,
      });
    } else {
      callbacks.showToast('Spectating — click a name in the roster to follow them.');
    }

    // Everything under the loader is mounted now; main.ts lifts it once the
    // arena layout and the first state snapshot have arrived.
    callbacks.onReady();
  });

  return () => {
    // Unconditional: the server joins the socket to the room's broadcast
    // group on 'lobby:join' *before* the ack arrives, so navigating away
    // mid-round-trip still needs the leave — joinedRoom may be null here.
    socket.emit('room:leave');
    socket.off('room:restarted', onRestarted);
    document.body.classList.remove('spectating');
    hideChat();
    hideSettingsModal();
    hideMatchHud();
    hideRankCard();
    hideMatchModal();
    callbacks.onExit();
  };
}
