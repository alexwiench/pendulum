const STORAGE_KEY = "pendulum-settings";
const SETTINGS_VERSION = 1;

export type FavoritePreset = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  name: string;
  color: { r: number; g: number; b: number };
  createdAt: number;
};

const FAVORITE_PALETTE: Array<{ r: number; g: number; b: number }> = [
  { r: 77, g: 148, b: 214 },   // blue
  { r: 209, g: 85, b: 120 },   // rose
  { r: 64, g: 191, b: 155 },   // teal
  { r: 230, g: 153, b: 51 },   // orange
  { r: 163, g: 112, b: 207 },  // purple
  { r: 214, g: 186, b: 60 },   // gold
  { r: 72, g: 185, b: 199 },   // cyan
  { r: 212, g: 90, b: 90 },    // red
  { r: 96, g: 180, b: 96 },    // green
  { r: 199, g: 112, b: 185 },  // magenta
  { r: 142, g: 186, b: 72 },   // lime
  { r: 108, g: 126, b: 199 },  // indigo
];

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function paletteIndexOf(color: { r: number; g: number; b: number }): number {
  return FAVORITE_PALETTE.findIndex(
    (c) => c.r === color.r && c.g === color.g && c.b === color.b,
  );
}

const DEFAULT_FAVORITES: Array<Omit<FavoritePreset, "id" | "createdAt">> = [
  { x1: 0.65, y1: 0, x2: 0.35, y2: 1, name: "Ease In Out", color: FAVORITE_PALETTE[0] },
  { x1: 0.7, y1: 0, x2: 1, y2: 1, name: "Ease In", color: FAVORITE_PALETTE[1] },
  { x1: 0, y1: 0, x2: 0.3, y2: 1, name: "Ease Out", color: FAVORITE_PALETTE[2] },
  { x1: 0.25, y1: 0, x2: 0, y2: 1, name: "Smooth Decel", color: FAVORITE_PALETTE[3] },
];

export type UpdateChannel = "stable" | "beta";

const DEFAULTS = {
  autoApply: true,
  graphFillColor: "rgba(74, 158, 255, 0.08)",
  playheadColor: { r: 74, g: 158, b: 255 },
  graphColor: { r: 74, g: 158, b: 255 },
  graphMaxSpeedColor: { r: 255, g: 74, b: 74 },
  ghostFadeDuration: 300,
  playheadPollInterval: 100,
  selectionPollInterval: 1000,
  ghostStrokeOpacity: 0.2,
  ghostFillOpacity: 0.03,
  updatesEnabled: true,
  updateChannel: "stable" as UpdateChannel,
};

class SettingsStore {
  autoApply = $state(DEFAULTS.autoApply);
  graphFillColor = $state(DEFAULTS.graphFillColor);
  playheadColor = $state({ ...DEFAULTS.playheadColor });
  graphColor = $state({ ...DEFAULTS.graphColor });
  graphMaxSpeedColor = $state({ ...DEFAULTS.graphMaxSpeedColor });
  ghostFadeDuration = $state(DEFAULTS.ghostFadeDuration);
  playheadPollInterval = $state(DEFAULTS.playheadPollInterval);
  selectionPollInterval = $state(DEFAULTS.selectionPollInterval);
  ghostStrokeOpacity = $state(DEFAULTS.ghostStrokeOpacity);
  ghostFillOpacity = $state(DEFAULTS.ghostFillOpacity);
  updatesEnabled = $state(DEFAULTS.updatesEnabled);
  updateChannel: UpdateChannel = $state(DEFAULTS.updateChannel);
  favorites: FavoritePreset[] = $state([]);

  nextFavoriteColor(): { r: number; g: number; b: number } {
    const counts = new Map<number, number>();
    for (let i = 0; i < FAVORITE_PALETTE.length; i++) counts.set(i, 0);
    for (const fav of this.favorites) {
      const idx = paletteIndexOf(fav.color);
      if (idx >= 0) counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }
    let minCount = Infinity;
    let minIdx = 0;
    for (const [idx, count] of counts) {
      if (count < minCount) {
        minCount = count;
        minIdx = idx;
      }
    }
    return { ...FAVORITE_PALETTE[minIdx] };
  }

  addFavorite(preset: { x1: number; y1: number; x2: number; y2: number }) {
    const fav: FavoritePreset = {
      id: crypto.randomUUID(),
      x1: preset.x1,
      y1: preset.y1,
      x2: preset.x2,
      y2: preset.y2,
      name: `${preset.x1.toFixed(2)}, ${preset.x2.toFixed(2)}`,
      color: this.nextFavoriteColor(),
      createdAt: Date.now(),
    };
    this.favorites = [fav, ...this.favorites];
    this.save();
    return fav;
  }

  removeFavorite(id: string) {
    this.favorites = this.favorites.filter((f) => f.id !== id);
    this.save();
  }

  renameFavorite(id: string, name: string) {
    this.favorites = this.favorites.map((f) =>
      f.id === id ? { ...f, name } : f,
    );
    this.save();
  }

  cycleFavoriteColor(id: string) {
    const fav = this.favorites.find((f) => f.id === id);
    if (!fav) return;
    const nextIdx = (paletteIndexOf(fav.color) + 1) % FAVORITE_PALETTE.length;
    this.favorites = this.favorites.map((f) =>
      f.id === id ? { ...f, color: { ...FAVORITE_PALETTE[nextIdx] } } : f,
    );
    this.save();
  }

  clearFavorites() {
    this.favorites = [];
    this.save();
  }

  reorderFavorites(fromIndex: number, toIndex: number) {
    const items = [...this.favorites];
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    this.favorites = items;
    this.save();
  }

  toJSON(): Record<string, unknown> {
    return {
      version: SETTINGS_VERSION,
      autoApply: this.autoApply,
      graphFillColor: this.graphFillColor,
      playheadColor: { ...this.playheadColor },
      graphColor: { ...this.graphColor },
      graphMaxSpeedColor: { ...this.graphMaxSpeedColor },
      ghostFadeDuration: this.ghostFadeDuration,
      playheadPollInterval: this.playheadPollInterval,
      selectionPollInterval: this.selectionPollInterval,
      ghostStrokeOpacity: this.ghostStrokeOpacity,
      ghostFillOpacity: this.ghostFillOpacity,
      updatesEnabled: this.updatesEnabled,
      updateChannel: this.updateChannel,
      favorites: this.favorites.map((f) => ({ ...f, color: { ...f.color } })),
    };
  }

  fromJSON(data: Record<string, unknown>) {
    if (typeof data.autoApply === "boolean") this.autoApply = data.autoApply;
    if (typeof data.graphFillColor === "string") this.graphFillColor = data.graphFillColor;
    for (const field of ["playheadColor", "graphColor", "graphMaxSpeedColor"] as const) {
      if (data[field] && typeof data[field] === "object") {
        const c = data[field] as Record<string, unknown>;
        if (typeof c.r === "number" && typeof c.g === "number" && typeof c.b === "number") {
          this[field] = {
            r: clampByte(c.r),
            g: clampByte(c.g),
            b: clampByte(c.b),
          };
        }
      }
    }
    if (typeof data.ghostFadeDuration === "number" && data.ghostFadeDuration >= 50 && data.ghostFadeDuration <= 2000)
      this.ghostFadeDuration = data.ghostFadeDuration;
    if (typeof data.playheadPollInterval === "number" && data.playheadPollInterval >= 50 && data.playheadPollInterval <= 500)
      this.playheadPollInterval = data.playheadPollInterval;
    if (typeof data.selectionPollInterval === "number" && data.selectionPollInterval >= 200 && data.selectionPollInterval <= 5000)
      this.selectionPollInterval = data.selectionPollInterval;
    if (typeof data.ghostStrokeOpacity === "number" && data.ghostStrokeOpacity >= 0 && data.ghostStrokeOpacity <= 1)
      this.ghostStrokeOpacity = data.ghostStrokeOpacity;
    if (typeof data.ghostFillOpacity === "number" && data.ghostFillOpacity >= 0 && data.ghostFillOpacity <= 1)
      this.ghostFillOpacity = data.ghostFillOpacity;
    if (typeof data.updatesEnabled === "boolean") this.updatesEnabled = data.updatesEnabled;
    if (data.updateChannel === "stable" || data.updateChannel === "beta") this.updateChannel = data.updateChannel;
    if (Array.isArray(data.favorites)) {
      const valid: FavoritePreset[] = [];
      for (const f of data.favorites) {
        if (
          f && typeof f === "object" &&
          typeof f.id === "string" &&
          typeof f.x1 === "number" && typeof f.y1 === "number" &&
          typeof f.x2 === "number" && typeof f.y2 === "number" &&
          typeof f.name === "string" &&
          f.color && typeof f.color.r === "number" && typeof f.color.g === "number" && typeof f.color.b === "number" &&
          typeof f.createdAt === "number"
        ) {
          valid.push({
            id: f.id, x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2,
            name: f.name,
            color: { r: clampByte(f.color.r), g: clampByte(f.color.g), b: clampByte(f.color.b) },
            createdAt: f.createdAt,
          });
        }
      }
      this.favorites = valid;
    }
  }

  private _saveTimer: ReturnType<typeof setTimeout> | null = null;

  save() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toJSON()));
      } catch {
        // localStorage may be unavailable
      }
    }, 300);
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.fromJSON(data);
      } else {
        this.seedDefaultFavorites();
      }
    } catch {
      // corrupt or unavailable — use defaults
    }
  }

  seedDefaultFavorites() {
    const existing = this.favorites;
    const toAdd = DEFAULT_FAVORITES.filter((def) =>
      !existing.some((f) => f.x1 === def.x1 && f.y1 === def.y1 && f.x2 === def.x2 && f.y2 === def.y2),
    );
    if (toAdd.length === 0) return false;
    const newFavs = toAdd.map((f) => ({
      ...f,
      color: { ...f.color },
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }));
    this.favorites = [...this.favorites, ...newFavs];
    this.save();
    return true;
  }

  reset() {
    this.autoApply = DEFAULTS.autoApply;
    this.graphFillColor = DEFAULTS.graphFillColor;
    this.playheadColor = { ...DEFAULTS.playheadColor };
    this.graphColor = { ...DEFAULTS.graphColor };
    this.graphMaxSpeedColor = { ...DEFAULTS.graphMaxSpeedColor };
    this.ghostFadeDuration = DEFAULTS.ghostFadeDuration;
    this.playheadPollInterval = DEFAULTS.playheadPollInterval;
    this.selectionPollInterval = DEFAULTS.selectionPollInterval;
    this.ghostStrokeOpacity = DEFAULTS.ghostStrokeOpacity;
    this.ghostFillOpacity = DEFAULTS.ghostFillOpacity;
    this.updatesEnabled = DEFAULTS.updatesEnabled;
    this.updateChannel = DEFAULTS.updateChannel;
    this.favorites = [];
    this.save();
  }

  exportToFile() {
    const json = JSON.stringify(this.toJSON(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pendulum-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  importFromFile(): Promise<void> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve();
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result as string);
            this.fromJSON(data);
            this.save();
            resolve();
          } catch {
            reject(new Error("Invalid settings file"));
          }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
      };
      input.click();
    });
  }
}

export const settings = new SettingsStore();
