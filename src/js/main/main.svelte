<script lang="ts">
  import { onMount } from "svelte";
  import { subscribeBackgroundColor } from "../lib/utils/bolt";
  import { settings } from "./settings.svelte";
  import { presets } from "./presets.svelte";
  import "../index.scss";
  import "./main.scss";
  import CurveEditor from "./CurveEditor.svelte";
  import SettingsPanel from "./SettingsPanel.svelte";

  let backgroundColor: string = $state("#232323");
  let settingsOpen = $state(false);

  settings.load();
  presets.load();

  onMount(() => {
    if (window.cep) {
      subscribeBackgroundColor((c: string) => (backgroundColor = c));
    }
    return () => {
      presets.save.flush();
      settings.save.flush();
    };
  });
</script>

<div class="app" style="background-color: {backgroundColor};">
  <div class="panel">
    <div class="section">
      <CurveEditor onOpenSettings={() => settingsOpen = true} />
    </div>
  </div>
</div>

<SettingsPanel open={settingsOpen} onclose={() => settingsOpen = false} />
