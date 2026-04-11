import { debounce } from "../lib/utils/bolt";

const PRESETS_KEY = "pendulum-presets";
const MAX_PRESETS = 20;
const SAVE_DEBOUNCE_MS = 300;

export type SavedPreset = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  source: "user" | "ghost";
  name?: string;
  savedAt: number;
};

class PresetStore {
  items: SavedPreset[] = $state([]);

  save = debounce(() => {
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(this.items));
    } catch {
      // localStorage may be unavailable
    }
  }, SAVE_DEBOUNCE_MS);

  load() {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.items = data;
        }
      }
    } catch {
      // corrupt or unavailable
    }
  }

  add(data: Omit<SavedPreset, "id" | "savedAt">) {
    if (this.items.length >= MAX_PRESETS) {
      this.items.pop();
    }
    const preset: SavedPreset = {
      ...data,
      id: crypto.randomUUID(),
      savedAt: Date.now(),
    };
    this.items.unshift(preset);
    this.save();
  }

  remove(id: string) {
    this.items = this.items.filter((p) => p.id !== id);
    this.save();
  }
}

export const presets = new PresetStore();
