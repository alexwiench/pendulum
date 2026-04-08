<script lang="ts">
  import { evalTS } from "../lib/utils/bolt";

  const handleClick = () => {
    evalTS("createNull").catch((e: any) => {
      console.error("createNull error:", e);
    });
  };
</script>

<button class="null-btn" title="Create Null Controller" onclick={handleClick}>
  <svg class="null-icon" viewBox="0 0 16 16" width="14" height="14">
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" />
    <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="1.5" />
    <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5" />
  </svg>
  <span>Create Null</span>
</button>

<style lang="scss">
  .null-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 4px;
    background: #252525;
    color: #aaa;
    font-size: 11px;
    font-weight: 500;
    width: 100%;
    box-sizing: border-box;
    transition: background 0.15s, color 0.15s;
  }

  .null-btn:hover {
    background: #333;
    color: #f5a623;
  }

  .null-btn:active {
    background: #2a2a2a;
  }

  .null-icon {
    flex-shrink: 0;
  }
</style>
