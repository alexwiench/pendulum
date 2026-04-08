const PRESETS_KEY = "pendulum-presets";

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

  private _saveTimer: ReturnType<typeof setTimeout> | null = null;

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

  save() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        localStorage.setItem(PRESETS_KEY, JSON.stringify(this.items));
      } catch {
        // localStorage may be unavailable
      }
    }, 300);
  }

  add(data: Omit<SavedPreset, "id" | "savedAt">) {
    if (this.items.length >= 20) {
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
