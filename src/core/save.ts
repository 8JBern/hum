/** Versioned save in localStorage, with migration and corrupt-save recovery. */

export const SAVE_KEY = 'hum.save';
export const SAVE_VERSION = 2;

export type ScareLevel = 'full' | 'reduced' | 'calm';
export type QualityName = 'low' | 'medium' | 'high' | 'auto';

export interface Settings {
  master: number;
  ambience: number;
  effects: number;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  headBob: boolean;
  motionBlur: boolean;
  soundCues: boolean;
  scare: ScareLevel;
  quality: QualityName;
  reduceFlicker: boolean;
}

export interface RunRecord {
  evidence: number;
  depth: number;
  time: number;
  escaped: boolean;
}

export interface SaveData {
  version: number;
  settings: Settings;
  seenWarning: boolean;
  seenIntro: boolean;
  banked: number;
  runs: number;
  escapes: number;
  best: RunRecord | null;
  perk: string | null;
  filter: number;
  lore: number[];
  daily: { date: string; best: RunRecord | null; streak: number; lastDate: string | null };
  /** Compact last death replay, for "your last tape". */
  lastTape: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  ambience: 0.8,
  effects: 0.9,
  sensitivity: 1,
  invertY: false,
  fov: 80,
  headBob: true,
  motionBlur: false,
  soundCues: false,
  scare: 'full',
  quality: 'auto',
  reduceFlicker: false,
};

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    seenWarning: false,
    seenIntro: false,
    banked: 0,
    runs: 0,
    escapes: 0,
    best: null,
    perk: null,
    filter: 0,
    lore: [],
    daily: { date: '', best: null, streak: 0, lastDate: null },
    lastTape: null,
  };
}

/** Version 1 stored settings flat and called banked evidence "evidence". */
interface SaveV1 {
  version: 1;
  volume?: number;
  sensitivity?: number;
  evidence?: number;
  runs?: number;
}

export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  if (r.version === 1) {
    const v1 = raw as SaveV1;
    base.settings.master = clamp01(Number(v1.volume ?? base.settings.master));
    base.settings.sensitivity = Number(v1.sensitivity ?? 1) || 1;
    base.banked = Math.max(0, Math.floor(Number(v1.evidence ?? 0)) || 0);
    base.runs = Math.max(0, Math.floor(Number(v1.runs ?? 0)) || 0);
    return base;
  }
  if (r.version === 2) {
    const s = raw as Partial<SaveData>;
    return {
      ...base,
      ...s,
      version: SAVE_VERSION,
      settings: { ...base.settings, ...(s.settings ?? {}) },
      daily: { ...base.daily, ...(s.daily ?? {}) },
      lore: Array.isArray(s.lore) ? s.lore.filter((n) => typeof n === 'number') : [],
      banked: Math.max(0, Number(s.banked) || 0),
    };
  }
  return base;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.8;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function store(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadSave(s: StorageLike | null = store()): SaveData {
  if (!s) return defaultSave();
  try {
    const txt = s.getItem(SAVE_KEY);
    if (!txt) return defaultSave();
    return migrate(JSON.parse(txt));
  } catch {
    // Corrupt JSON: keep a copy for inspection and start fresh.
    try {
      const txt = s.getItem(SAVE_KEY);
      if (txt) s.setItem(SAVE_KEY + '.corrupt', txt);
    } catch {
      /* ignore */
    }
    return defaultSave();
  }
}

export function writeSave(data: SaveData, s: StorageLike | null = store()): boolean {
  if (!s) return false;
  try {
    s.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
