<script lang="ts">
  import { settings } from "./settings.svelte";
  import { updater } from "./updater.svelte";
  import { version } from "../../shared/shared";
  import { evalTS } from "../lib/utils/bolt";

  type RGBField = "playheadColor" | "graphColor" | "graphMaxSpeedColor";

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  function rgbToHex(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map(c => c.toString(16).padStart(2, "0")).join("");
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
    <button class="close-btn" onclick={onclose}>&times;</button>
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
    </div>

    <!-- Appearance -->
    <div class="section">
      <div class="section-title">Appearance</div>

      <div class="row">
        <span class="label-text">Graph</span>
        <div class="color-pick-group">
          <button class="color-swatch clickable" style="background-color: rgb({settings.graphColor.r},{settings.graphColor.g},{settings.graphColor.b});" onclick={() => openRgbPicker("graphColor")}></button>
          <span class="color-hex-label">{rgbToHex(settings.graphColor.r, settings.graphColor.g, settings.graphColor.b)}</span>
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
        <span class="label-text">Peak speed</span>
        <div class="color-pick-group">
          <button class="color-swatch clickable" style="background-color: rgb({settings.graphMaxSpeedColor.r},{settings.graphMaxSpeedColor.g},{settings.graphMaxSpeedColor.b});" onclick={() => openRgbPicker("graphMaxSpeedColor")}></button>
          <span class="color-hex-label">{rgbToHex(settings.graphMaxSpeedColor.r, settings.graphMaxSpeedColor.g, settings.graphMaxSpeedColor.b)}</span>
        </div>
      </div>

      <div class="subsection-divider"></div>

      <div class="row slider-row">
        <span class="label-text">Ghost stroke</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.ghostStrokeOpacity}
          oninput={handleInput("ghostStrokeOpacity")}
        />
        <span class="slider-value">{settings.ghostStrokeOpacity.toFixed(2)}</span>
      </div>
      <div class="row slider-row">
        <span class="label-text">Ghost fill</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.ghostFillOpacity}
          oninput={handleInput("ghostFillOpacity")}
        />
        <span class="slider-value">{settings.ghostFillOpacity.toFixed(2)}</span>
      </div>
    </div>

    <!-- Performance -->
    <div class="section">
      <div class="section-title">Performance</div>
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

    <!-- Favorites -->
    <div class="section">
      <div class="section-title">Favorites</div>
      <div class="button-group">
        <button class="action-btn" onclick={() => settings.clearFavorites()}>Clear Favorites</button>
        <button class="action-btn" onclick={() => settings.seedDefaultFavorites()}>Restore Defaults</button>
      </div>
    </div>

    <!-- Data -->
    <div class="section">
      <div class="section-title">Data</div>
      <div class="button-group">
        <button class="action-btn" onclick={() => settings.exportToFile()}>Export Settings</button>
        <button class="action-btn" onclick={handleImport}>Import Settings</button>
        <button class="action-btn danger" onclick={handleReset}>Reset All</button>
      </div>
    </div>

    <!-- Updates -->
    <div class="section">
      <div class="section-title">Updates</div>
      <div class="row">
        <span class="label-text">Version</span>
        <span class="version-value">{version}</span>
      </div>
      <label class="row">
        <input
          type="checkbox"
          checked={settings.updatesEnabled}
          onchange={(e) => saveAfter(() => settings.updatesEnabled = (e.target as HTMLInputElement).checked)}
        />
        <span class="label-text">Check for updates</span>
      </label>
      <div class="row">
        <span class="label-text">Channel</span>
        <select
          class="text-input channel-select"
          value={settings.updateChannel}
          onchange={(e) => saveAfter(() => settings.updateChannel = (e.target as HTMLSelectElement).value as "stable" | "beta")}
        >
          <option value="stable">Stable</option>
          <option value="beta">Beta</option>
        </select>
      </div>
      <div class="button-group">
        <button class="action-btn" onclick={() => updater.checkForUpdates(true)} disabled={updater.checking}>
          {updater.checking ? "Checking..." : "Check Now"}
        </button>
      </div>
      {#if updater.installSource === "exchange" || updater.installSource === "aescripts"}
        <div class="managed-warning">Managed install detected. Updates are handled by {updater.installSource}.</div>
      {/if}
      {#if updater.error}
        <div class="update-error">{updater.error}</div>
      {/if}
      {#if updater.showBanner}
        <div class="update-available">v{updater.updateAvailable!.version} available</div>
      {/if}
    </div>
  </div>
</div>
{/if}

<style>
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
    background: #1e1e1e;
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
    padding: 6px 8px;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }

  .title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .close-btn {
    cursor: pointer;
    color: #888;
    font-size: 16px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 3px;
    background: transparent;
    border: none;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: #f5a623;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    scrollbar-width: none;
  }

  .content::-webkit-scrollbar {
    display: none;
  }

  .section {
    background: #252525;
    border-radius: 4px;
    padding: 6px 8px;
    margin-bottom: 4px;
  }

  .section-title {
    font-size: 9px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 4px;
  }

  .subsection-divider {
    height: 1px;
    background: #333;
    margin: 6px 0;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
  }

  .label-text {
    font-size: 11px;
    color: #bbb;
    white-space: nowrap;
    min-width: 0;
  }

  /* Sliders */
  .slider-row .label-text {
    min-width: 55px;
    flex-shrink: 0;
  }

  .slider-row input[type="range"] {
    flex: 1;
    height: 3px;
    accent-color: #f5a623;
    cursor: pointer;
    min-width: 40px;
  }

  .slider-value {
    font-size: 10px;
    color: #666;
    min-width: 30px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* Checkbox */
  input[type="checkbox"] {
    accent-color: #f5a623;
    cursor: pointer;
    margin: 0;
  }

  /* Text / number inputs */
  .text-input {
    background: #333;
    color: #e0e0e0;
    border: 1px solid #444;
    border-radius: 3px;
    padding: 3px 6px;
    font-size: 11px;
    font-family: inherit;
    box-sizing: border-box;
  }

  /* Colors */
  .color-pick-group {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }

  .color-swatch {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid #444;
    flex-shrink: 0;
    padding: 0;
    background: transparent;
  }

  .color-swatch.clickable {
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .color-swatch.clickable:hover {
    border-color: #f5a623;
  }

  .color-hex-label {
    font-family: monospace;
    font-size: 10px;
    color: #666;
  }

  /* Number inputs */
  .number-with-suffix {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-left: auto;
  }

  .num-input {
    width: 48px;
    text-align: right;
  }

  .suffix {
    font-size: 10px;
    color: #666;
  }

  /* Action buttons */
  .button-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .action-btn {
    cursor: pointer;
    background: #333;
    color: #999;
    font-size: 10px;
    padding: 5px 8px;
    border-radius: 3px;
    border: none;
    text-align: center;
    transition: background 0.15s, color 0.15s;
  }

  .action-btn:hover {
    background: #444;
    color: #e0e0e0;
  }

  .action-btn.danger:hover {
    background: #d44;
    color: #fff;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .action-btn:disabled:hover {
    background: #333;
    color: #999;
  }

  /* Version & update info */
  .version-value {
    font-family: monospace;
    font-size: 10px;
    color: #666;
    margin-left: auto;
  }

  .channel-select {
    margin-left: auto;
    width: 72px;
    padding: 3px 4px;
    cursor: pointer;
  }

  .managed-warning {
    font-size: 10px;
    color: #888;
    padding: 4px 0 2px;
    line-height: 1.3;
  }

  .update-error {
    font-size: 10px;
    color: #d44;
    padding: 4px 0 2px;
  }

  .update-available {
    font-size: 10px;
    color: #f5a623;
    padding: 4px 0 2px;
    font-weight: 600;
  }

  /* Hide number input spinners */
  input[type="number"] {
    -moz-appearance: textfield;
  }

  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
</style>
