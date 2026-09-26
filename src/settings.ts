import { GAME } from './constants';

export interface GameSettings {
  readonly mouseSensitivity: number;
}

export type SettingsListener = (settings: GameSettings) => void;

const SETTINGS_VERSION = 1;
export const SETTINGS_STORAGE_KEY = 'warzone-tabletop.settings.v1';

const sensitivity = GAME.controls.mouseSensitivity;

export const DEFAULT_SETTINGS: GameSettings = Object.freeze({
  mouseSensitivity: sensitivity.default,
});

function normalizeMouseSensitivity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.mouseSensitivity;
  }
  return Math.round(Math.min(Math.max(value, sensitivity.minimum), sensitivity.maximum));
}

function resolveBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadSettings(storage: Storage | null): GameSettings {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const serialized = storage.getItem(SETTINGS_STORAGE_KEY);
    if (!serialized) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(serialized) as {
      version?: unknown;
      mouseSensitivity?: unknown;
    };
    if (parsed.version !== SETTINGS_VERSION) return { ...DEFAULT_SETTINGS };
    return {
      mouseSensitivity: normalizeMouseSensitivity(parsed.mouseSensitivity),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function mouseSensitivityMultiplier(value: number): number {
  return normalizeMouseSensitivity(value) / sensitivity.default;
}

export class SettingsStore {
  private readonly listeners = new Set<SettingsListener>();
  private current: GameSettings;

  constructor(private readonly storage: Storage | null = resolveBrowserStorage()) {
    this.current = loadSettings(storage);
  }

  snapshot(): GameSettings {
    return { ...this.current };
  }

  setMouseSensitivity(value: number): void {
    const next = normalizeMouseSensitivity(value);
    if (next === this.current.mouseSensitivity) return;
    this.current = { ...this.current, mouseSensitivity: next };
    this.persist();
    this.emit();
  }

  reset(): void {
    this.current = { ...DEFAULT_SETTINGS };
    this.persist();
    this.emit();
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ version: SETTINGS_VERSION, ...this.current }),
      );
    } catch {
      // Settings remain active for this page load when persistence is unavailable.
    }
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
