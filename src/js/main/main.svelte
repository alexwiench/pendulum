<script lang="ts">
  import { onMount } from "svelte";
  import { subscribeBackgroundColor } from "../lib/utils/bolt";
  import "../index.scss";
  import "./main.scss";
  import AnchorGrid from "./AnchorGrid.svelte";
  import NullCreator from "./NullCreator.svelte";

  let backgroundColor: string = $state("#232323");

  onMount(() => {
    if (window.cep) {
      subscribeBackgroundColor((c: string) => (backgroundColor = c));
    }
  });
</script>

<div class="app" style="background-color: {backgroundColor};">
  <div class="panel">
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

<style lang="scss">
  @use "../variables.scss" as *;
</style>
