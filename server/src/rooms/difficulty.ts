import type { BotDifficulty } from '@tank/shared';

export type ConcreteDifficulty = Exclude<BotDifficulty, 'adaptive'>;

export interface DifficultyProfile {
  updateInterval: number;
  aggressionRange: [number, number];
  dodgeChance: number;
}

const DIFFICULTY_PROFILES: Record<ConcreteDifficulty, DifficultyProfile> = {
  easy: { updateInterval: 600, aggressionRange: [0.2, 0.4], dodgeChance: 0.2 },
  normal: { updateInterval: 400, aggressionRange: [0.5, 0.7], dodgeChance: 0.6 },
  hard: { updateInterval: 250, aggressionRange: [0.75, 0.95], dodgeChance: 0.95 },
};

// Rating thresholds an "adaptive" room falls back to when it has no rated
// (logged-in) humans to gauge against.
const ADAPTIVE_FALLBACK: ConcreteDifficulty = 'normal';

export function resolveConcreteDifficulty(
  requested: BotDifficulty,
  avgHumanRating: number | null,
): ConcreteDifficulty {
  if (requested !== 'adaptive') return requested;
  if (avgHumanRating === null) return ADAPTIVE_FALLBACK;
  if (avgHumanRating < 900) return 'easy';
  if (avgHumanRating > 1200) return 'hard';
  return 'normal';
}

export function getDifficultyProfile(difficulty: ConcreteDifficulty): DifficultyProfile {
  return DIFFICULTY_PROFILES[difficulty];
}

export function randomInRange([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}

// Co-op enemies get steadily nastier as the defenders survive more waves,
// on top of whatever base difficulty the room was set to.
export function applyWaveScaling(profile: DifficultyProfile, wave: number): DifficultyProfile {
  const boost = Math.min(0.3, (wave - 1) * 0.05);
  return {
    updateInterval: Math.max(150, profile.updateInterval - (wave - 1) * 15),
    aggressionRange: [
      Math.min(1, profile.aggressionRange[0] + boost),
      Math.min(1, profile.aggressionRange[1] + boost),
    ],
    dodgeChance: Math.min(1, profile.dodgeChance + boost),
  };
}
