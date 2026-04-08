<script lang="ts">
  import { onMount } from "svelte";
  import { subscribeBackgroundColor } from "../lib/utils/bolt";
  import { settings } from "./settings.svelte";
  import "../index.scss";
  import "./main.scss";
  import CurveEditor from "./CurveEditor.svelte";
  import AnchorGrid from "./AnchorGrid.svelte";
  import NullCreator from "./NullCreator.svelte";
  import SettingsPanel from "./SettingsPanel.svelte";

  let backgroundColor: string = $state("#232323");
  let settingsOpen = $state(false);

  settings.load();

  onMount(() => {
    if (window.cep) {
      subscribeBackgroundColor((c: string) => (backgroundColor = c));
    }
  });
</script>

<div class="app" style="background-color: {backgroundColor};">
  <div class="panel">
    <div class="panel-header">
      <button class="gear-btn" onclick={() => settingsOpen = true} title="Settings">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.5.75a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v.72a5.5 5.5 0 0 1 1.43.6l.51-.51a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1 0 1.06l-.51.51c.26.45.46.93.6 1.43h.72a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-.72a5.5 5.5 0 0 1-.6 1.43l.51.51a.75.75 0 0 1 0 1.06l-1.06 1.06a.75.75 0 0 1-1.06 0l-.51-.51a5.5 5.5 0 0 1-1.43.6v.72a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-.72a5.5 5.5 0 0 1-1.43-.6l-.51.51a.75.75 0 0 1-1.06 0L2.44 12.5a.75.75 0 0 1 0-1.06l.51-.51a5.5 5.5 0 0 1-.6-1.43H1.63a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 .75-.75h.72c.14-.5.34-.98.6-1.43l-.51-.51a.75.75 0 0 1 0-1.06L3.5 2.44a.75.75 0 0 1 1.06 0l.51.51A5.5 5.5 0 0 1 6.5 2.35V.75zM8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
        </svg>
      </button>
    </div>
    <div class="section">
      <h3 class="section-title">Easing</h3>
      <CurveEditor />
    </div>
    <div class="section">
      <h3 class="section-title">Anchor Point</h3>
      <AnchorGrid />
    </div>
    <div class="section">
      <h3 class="section-title">Null Objects</h3>
      <NullCreator />
    </div>
  </div>
</div>

<SettingsPanel open={settingsOpen} onclose={() => settingsOpen = false} />

<style lang="scss">
  @use "../variables.scss" as *;

  .panel-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: -4px;
  }

  .gear-btn {
    all: unset;
    cursor: pointer;
    color: #666;
    padding: 2px;
    border-radius: 3px;
    transition: color 0.15s;
    line-height: 0;

    &:hover {
      color: #f5a623;
    }
  }
</style>
