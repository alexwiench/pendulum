<script lang="ts">
  import { slide } from "svelte/transition";

  let { version, onDismiss, onDownload }: {
    version: string;
    onDismiss: () => void;
    onDownload: () => void;
  } = $props();
</script>

<div class="update-banner" transition:slide={{ duration: 200 }}>
  <span class="update-message">
    v<span class="update-version">{version}</span> available
  </span>
  <button class="update-view-btn" onclick={onDownload}>View</button>
  <button class="update-dismiss-btn" onclick={onDismiss}>&times;</button>
</div>

<style>
  .update-banner {
    display: flex;
    align-items: center;
    height: 28px;
    padding: 0 8px;
    background: #2a2520;
    border-bottom: 1px solid rgba(245, 166, 35, 0.25);
    font-size: 11px;
    flex-shrink: 0;
  }

  .update-message {
    color: #ccc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .update-version {
    color: #f5a623;
    font-weight: 600;
  }

  .update-view-btn {
    cursor: pointer;
    background: #333;
    color: #999;
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 3px;
    border: none;
    margin-left: 8px;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }

  .update-view-btn:hover {
    background: #444;
    color: #e0e0e0;
  }

  .update-dismiss-btn {
    cursor: pointer;
    background: transparent;
    border: none;
    color: #555;
    font-size: 14px;
    line-height: 1;
    padding: 2px 4px;
    margin-left: auto;
    border-radius: 3px;
    flex-shrink: 0;
    transition: color 0.15s;
  }

  .update-dismiss-btn:hover {
    color: #e0e0e0;
  }
</style>
