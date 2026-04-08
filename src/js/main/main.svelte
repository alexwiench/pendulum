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
    <div class="section">
      <CurveEditor onOpenSettings={() => settingsOpen = true} />
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
