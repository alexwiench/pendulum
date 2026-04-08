const STORAGE_KEY = "pendulum-settings";
const SETTINGS_VERSION = 1;

const DEFAULTS = {
  autoApply: true,
  defaultViewMode: "graph" as "curve" | "graph",
  curveColor: "#f5a623",
  graphFillColor: "rgba(74, 158, 255, 0.08)",
  playheadColor: { r: 74, g: 158, b: 255 },
  graphColor: { r: 74, g: 158, b: 255 },
  graphMaxSpeedColor: { r: 255, g: 74, b: 74 },
  scaleSmoothing: 0.15,
  ghostFadeDuration: 300,
  playheadPollInterval: 100,
  selectionPollInterval: 1000,
  ghostStrokeOpacity: 0.2,
  ghostFillOpacity: 0.03,
};

class SettingsStore {
  autoApply = $state(DEFAULTS.autoApply);
  defaultViewMode: "curve" | "graph" = $state(DEFAULTS.defaultViewMode);
  curveColor = $state(DEFAULTS.curveColor);
  graphFillColor = $state(DEFAULTS.graphFillColor);
  playheadColor = $state({ ...DEFAULTS.playheadColor });
  graphColor = $state({ ...DEFAULTS.graphColor });
  graphMaxSpeedColor = $state({ ...DEFAULTS.graphMaxSpeedColor });
  scaleSmoothing = $state(DEFAULTS.scaleSmoothing);
  ghostFadeDuration = $state(DEFAULTS.ghostFadeDuration);
  playheadPollInterval = $state(DEFAULTS.playheadPollInterval);
  selectionPollInterval = $state(DEFAULTS.selectionPollInterval);
  ghostStrokeOpacity = $state(DEFAULTS.ghostStrokeOpacity);
  ghostFillOpacity = $state(DEFAULTS.ghostFillOpacity);

  toJSON(): Record<string, unknown> {
    return {
      version: SETTINGS_VERSION,
      autoApply: this.autoApply,
      defaultViewMode: this.defaultViewMode,
      curveColor: this.curveColor,
      graphFillColor: this.graphFillColor,
      playheadColor: { ...this.playheadColor },
      graphColor: { ...this.graphColor },
      graphMaxSpeedColor: { ...this.graphMaxSpeedColor },
      scaleSmoothing: this.scaleSmoothing,
      ghostFadeDuration: this.ghostFadeDuration,
      playheadPollInterval: this.playheadPollInterval,
      selectionPollInterval: this.selectionPollInterval,
      ghostStrokeOpacity: this.ghostStrokeOpacity,
      ghostFillOpacity: this.ghostFillOpacity,
    };
  }

  fromJSON(data: Record<string, unknown>) {
    if (typeof data.autoApply === "boolean") this.autoApply = data.autoApply;
    if (data.defaultViewMode === "curve" || data.defaultViewMode === "graph")
      this.defaultViewMode = data.defaultViewMode;
    if (typeof data.curveColor === "string") this.curveColor = data.curveColor;
    if (typeof data.graphFillColor === "string") this.graphFillColor = data.graphFillColor;
    for (const field of ["playheadColor", "graphColor", "graphMaxSpeedColor"] as const) {
      if (data[field] && typeof data[field] === "object") {
        const c = data[field] as Record<string, unknown>;
        if (typeof c.r === "number" && typeof c.g === "number" && typeof c.b === "number") {
          this[field] = {
            r: Math.max(0, Math.min(255, Math.round(c.r))),
            g: Math.max(0, Math.min(255, Math.round(c.g))),
            b: Math.max(0, Math.min(255, Math.round(c.b))),
          };
        }
      }
    }
    if (typeof data.scaleSmoothing === "number" && data.scaleSmoothing >= 0.01 && data.scaleSmoothing <= 1)
      this.scaleSmoothing = data.scaleSmoothing;
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
      }
    } catch {
      // corrupt or unavailable — use defaults
    }
  }

  reset() {
    this.autoApply = DEFAULTS.autoApply;
    this.defaultViewMode = DEFAULTS.defaultViewMode;
    this.curveColor = DEFAULTS.curveColor;
    this.graphFillColor = DEFAULTS.graphFillColor;
    this.playheadColor = { ...DEFAULTS.playheadColor };
    this.graphColor = { ...DEFAULTS.graphColor };
    this.graphMaxSpeedColor = { ...DEFAULTS.graphMaxSpeedColor };
    this.scaleSmoothing = DEFAULTS.scaleSmoothing;
    this.ghostFadeDuration = DEFAULTS.ghostFadeDuration;
    this.playheadPollInterval = DEFAULTS.playheadPollInterval;
    this.selectionPollInterval = DEFAULTS.selectionPollInterval;
    this.ghostStrokeOpacity = DEFAULTS.ghostStrokeOpacity;
    this.ghostFillOpacity = DEFAULTS.ghostFillOpacity;
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
