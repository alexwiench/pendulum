<script lang="ts">
  import { settings } from "./settings.svelte";
  import { evalTS } from "../lib/utils/bolt";

  type RGBField = "playheadColor" | "graphColor" | "graphMaxSpeedColor";

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  function rgbToHex(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map(c => c.toString(16).padStart(2, "0")).join("");
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  async function openRgbPicker(field: RGBField) {
    const c = settings[field];
    try {
      const result = await evalTS("pickColor", c.r, c.g, c.b);
      if (result === "cancelled") return;
      const [r, g, b] = (result as string).split(",").map(Number);
      settings[field] = { r, g, b };
      settings.save();
    } catch { /* picker unavailable outside AE */ }
  }

  async function openCurveColorPicker() {
    const rgb = hexToRgb(settings.curveColor);
    const r = rgb?.r ?? 245, g = rgb?.g ?? 166, b = rgb?.b ?? 35;
    try {
      const result = await evalTS("pickColor", r, g, b);
      if (result === "cancelled") return;
      const [nr, ng, nb] = (result as string).split(",").map(Number);
      settings.curveColor = rgbToHex(nr, ng, nb);
      settings.save();
    } catch { /* picker unavailable outside AE */ }
  }

  function saveAfter(fn: () => void) {
    fn();
    settings.save();
  }

  function handleInput(field: keyof typeof settings, parse: "int" | "float" = "float") {
    return (e: Event) => {
      const val = parse === "int"
        ? parseInt((e.target as HTMLInputElement).value, 10)
        : parseFloat((e.target as HTMLInputElement).value);
      if (!Number.isNaN(val)) {
        (settings as any)[field] = val;
        settings.save();
      }
    };
  }

  function handleReset() {
    if (window.confirm("Reset all settings to defaults?")) {
      settings.reset();
    }
  }

  async function handleImport() {
    try {
      await settings.importFromFile();
    } catch {
      // ignore
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={onclose} onkeydown={() => {}}></div>

  <div class="settings-panel">
  <div class="header">
    <span class="title">Settings</span>
    <button class="close-btn" onclick={onclose}>&#x2715;</button>
  </div>

  <div class="content">
    <!-- Behavior -->
    <div class="section">
      <div class="section-title">Behavior</div>
      <label class="row">
        <input
          type="checkbox"
          checked={settings.autoApply}
          onchange={(e) => saveAfter(() => settings.autoApply = (e.target as HTMLInputElement).checked)}
        />
        <span class="label-text">Auto-apply to selection</span>
      </label>
      <div class="row">
        <span class="label-text">Default view</span>
        <div class="toggle-group">
          <button
            class="toggle-btn"
            class:active={settings.defaultViewMode === "curve"}
            onclick={() => saveAfter(() => settings.defaultViewMode = "curve")}
          >Curve</button>
          <button
            class="toggle-btn"
            class:active={settings.defaultViewMode === "graph"}
            onclick={() => saveAfter(() => settings.defaultViewMode = "graph")}
          >Graph</button>
        </div>
      </div>
    </div>

    <!-- Canvas -->
    <div class="section">
      <div class="section-title">Canvas</div>
      <div class="row slider-row">
        <span class="label-text">Scale smoothing</span>
        <input
          type="range"
          min="0.01"
          max="1"
          step="0.01"
          value={settings.scaleSmoothing}
          oninput={handleInput("scaleSmoothing")}
        />
        <span class="value">{settings.scaleSmoothing.toFixed(2)}</span>
      </div>
    </div>

    <!-- Colors -->
    <div class="section">
      <div class="section-title">Colors</div>
      <div class="row">
        <span class="label-text">Curve</span>
        <div class="color-pick-group">
          <button class="color-swatch clickable" style="background-color: {settings.curveColor};" onclick={openCurveColorPicker}></button>
          <span class="color-hex-label">{settings.curveColor}</span>
        </div>
      </div>
      <div class="row">
        <span class="label-text">Playhead</span>
        <div class="color-pick-group">
          <button class="color-swatch clickable" style="background-color: rgb({settings.playheadColor.r},{settings.playheadColor.g},{settings.playheadColor.b});" onclick={() => openRgbPicker("playheadColor")}></button>
          <span class="color-hex-label">{rgbToHex(settings.playheadColor.r, settings.playheadColor.g, settings.playheadColor.b)}</span>
        </div>
      </div>
      <div class="row">
        <span class="label-text">Graph</span>
        <div class="color-pick-group">
          <button class="color-swatch clickable" style="background-color: rgb({settings.graphColor.r},{settings.graphColor.g},{settings.graphColor.b});" onclick={() => openRgbPicker("graphColor")}></button>
          <span class="color-hex-label">{rgbToHex(settings.graphColor.r, settings.graphColor.g, settings.graphColor.b)}</span>
        </div>
      </div>
      <div class="row">
        <span class="label-text">Max speed</span>
        <div class="color-pick-group">
          <button class="color-swatch clickable" style="background-color: rgb({settings.graphMaxSpeedColor.r},{settings.graphMaxSpeedColor.g},{settings.graphMaxSpeedColor.b});" onclick={() => openRgbPicker("graphMaxSpeedColor")}></button>
          <span class="color-hex-label">{rgbToHex(settings.graphMaxSpeedColor.r, settings.graphMaxSpeedColor.g, settings.graphMaxSpeedColor.b)}</span>
        </div>
      </div>
    </div>

    <!-- Timing -->
    <div class="section">
      <div class="section-title">Timing</div>
      <div class="row">
        <span class="label-text">Ghost fade</span>
        <div class="number-with-suffix">
          <input
            type="number"
            class="text-input num-input"
            min="50"
            max="2000"
            value={settings.ghostFadeDuration}
            onchange={handleInput("ghostFadeDuration", "int")}
          />
          <span class="suffix">ms</span>
        </div>
      </div>
      <div class="row">
        <span class="label-text">Playhead poll</span>
        <div class="number-with-suffix">
          <input
            type="number"
            class="text-input num-input"
            min="50"
            max="500"
            value={settings.playheadPollInterval}
            onchange={handleInput("playheadPollInterval", "int")}
          />
          <span class="suffix">ms</span>
        </div>
      </div>
      <div class="row">
        <span class="label-text">Selection poll</span>
        <div class="number-with-suffix">
          <input
            type="number"
            class="text-input num-input"
            min="200"
            max="5000"
            value={settings.selectionPollInterval}
            onchange={handleInput("selectionPollInterval", "int")}
          />
          <span class="suffix">ms</span>
        </div>
      </div>
    </div>

    <!-- Ghost Curves -->
    <div class="section">
      <div class="section-title">Ghost Curves</div>
      <div class="row slider-row">
        <span class="label-text">Stroke opacity</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.ghostStrokeOpacity}
          oninput={handleInput("ghostStrokeOpacity")}
        />
        <span class="value">{settings.ghostStrokeOpacity.toFixed(2)}</span>
      </div>
      <div class="row slider-row">
        <span class="label-text">Fill opacity</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.ghostFillOpacity}
          oninput={handleInput("ghostFillOpacity")}
        />
        <span class="value">{settings.ghostFillOpacity.toFixed(2)}</span>
      </div>
    </div>

    <!-- Data -->
    <div class="section">
      <div class="section-title">Data</div>
      <div class="button-group">
        <button class="action-btn" onclick={() => settings.exportToFile()}>Export Settings</button>
        <button class="action-btn" onclick={handleImport}>Import Settings</button>
        <button class="action-btn danger" onclick={handleReset}>Reset to Defaults</button>
      </div>
    </div>
  </div>
</div>
{/if}

<style lang="scss">
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 900;
  }

  .settings-panel {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: 100%;
    background: #1a1a1a;
    z-index: 901;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #e0e0e0;
    font-size: 11px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }

  .title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .close-btn {
    all: unset;
    cursor: pointer;
    color: #aaa;
    font-size: 14px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 3px;

    &:hover {
      color: #f5a623;
    }
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
  }

  .section {
    background: #252525;
    border-radius: 4px;
    padding: 8px;
    margin-bottom: 6px;
  }

  .section-title {
    font-size: 10px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
  }

  .label-text {
    font-size: 11px;
    color: #ccc;
    white-space: nowrap;
  }

  .slider-row {
    .label-text {
      min-width: 60px;
    }

    input[type="range"] {
      flex: 1;
      height: 3px;
      accent-color: #f5a623;
      cursor: pointer;
    }

    .value {
      font-size: 10px;
      color: #888;
      min-width: 36px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
  }

  /* Checkbox */
  input[type="checkbox"] {
    accent-color: #f5a623;
    cursor: pointer;
    margin: 0;
  }

  /* Toggle group */
  .toggle-group {
    display: flex;
    margin-left: auto;
    gap: 1px;
    background: #1a1a1a;
    border-radius: 3px;
    overflow: hidden;
  }

  .toggle-btn {
    all: unset;
    cursor: pointer;
    padding: 3px 10px;
    font-size: 10px;
    color: #aaa;
    background: #333;
    transition: background 0.15s, color 0.15s;

    &:hover {
      color: #e0e0e0;
    }

    &.active {
      background: #f5a623;
      color: #1a1a1a;
      font-weight: 600;
    }
  }

  /* Text / number inputs */
  .text-input {
    all: unset;
    background: #333;
    color: #e0e0e0;
    border-radius: 3px;
    padding: 3px 6px;
    font-size: 11px;
    font-family: inherit;
    box-sizing: border-box;
  }

  .color-pick-group {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }

  .color-swatch {
    all: unset;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    border: 1px solid #555;
    flex-shrink: 0;

    &.clickable {
      cursor: pointer;

      &:hover {
        border-color: #f5a623;
        box-shadow: 0 0 0 1px #f5a623;
      }
    }
  }

  .color-hex-label {
    font-family: monospace;
    font-size: 10px;
    color: #888;
  }

  .number-with-suffix {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-left: auto;
  }

  .num-input {
    width: 56px;
    text-align: right;
  }

  .suffix {
    font-size: 10px;
    color: #888;
  }

  /* Action buttons */
  .button-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .action-btn {
    all: unset;
    cursor: pointer;
    background: #333;
    color: #aaa;
    font-size: 11px;
    padding: 6px 10px;
    border-radius: 3px;
    text-align: center;
    transition: background 0.15s, color 0.15s;

    &:hover {
      background: #f5a623;
      color: #1a1a1a;
    }

    &.danger:hover {
      background: #d44;
      color: #fff;
    }
  }

  /* Hide number input spinners in CEP */
  input[type="number"] {
    -moz-appearance: textfield;

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  }
</style>
