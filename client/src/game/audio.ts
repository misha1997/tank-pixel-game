const CLIPS = {
  shot: '/sounds/shot.mp3',
  dead: '/sounds/dead.mp3',
  start: '/sounds/start.mp3',
} as const;

export type SoundName = keyof typeof CLIPS;

const VOLUME: Record<SoundName, number> = {
  shot: 0.35,
  dead: 0.5,
  start: 0.6,
};

const base: Record<SoundName, HTMLAudioElement> = {
  shot: new Audio(CLIPS.shot),
  dead: new Audio(CLIPS.dead),
  start: new Audio(CLIPS.start),
};

// Sound effects can overlap (two tanks dying the same tick, rapid-fire) — a
// single shared <audio> element can't play itself twice at once, so each
// call clones a fresh one and lets it be garbage-collected once it ends.
// play() rejects if it runs before any user gesture has unlocked audio
// (e.g. a stray 'user dead sound' broadcast that arrives before the player
// has clicked anything) — that rejection is expected and safely ignored.
export function playSound(name: SoundName): void {
  const clip = base[name].cloneNode(true) as HTMLAudioElement;
  clip.volume = VOLUME[name];
  clip.play().catch(() => {});
}
