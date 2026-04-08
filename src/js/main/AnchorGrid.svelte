<script lang="ts">
  import { evalTS } from "../lib/utils/bolt";

  const positions = [
    ["TL", "TC", "TR"],
    ["ML", "MC", "MR"],
    ["BL", "BC", "BR"],
  ];

  const labels: Record<string, string> = {
    TL: "Top Left",
    TC: "Top Center",
    TR: "Top Right",
    ML: "Middle Left",
    MC: "Center",
    MR: "Middle Right",
    BL: "Bottom Left",
    BC: "Bottom Center",
    BR: "Bottom Right",
  };

  const handleClick = (pos: string) => {
    evalTS("moveAnchorPoint", pos).catch((e: any) => {
      console.error("moveAnchorPoint error:", e);
    });
  };
</script>

<div class="anchor-grid">
  {#each positions as row}
    {#each row as pos}
      <button
        class="anchor-dot"
        title={labels[pos]}
        onclick={() => handleClick(pos)}
      ></button>
    {/each}
  {/each}
</div>

<style lang="scss">
  .anchor-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    width: 72px;
    height: 72px;
    gap: 0;
    border: 1px solid #333;
    background: #1a1a1a;
    border-radius: 4px;
    padding: 4px;
  }

  .anchor-dot {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 2px;
    background: transparent;
    padding: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
  }

  .anchor-dot::after {
    content: "";
    display: block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #888;
    transition: background 0.15s, transform 0.15s;
  }

  .anchor-dot:hover {
    background: transparent;
  }

  .anchor-dot:hover::after {
    background: #f5a623;
    transform: scale(1.3);
  }

  .anchor-dot:active::after {
    background: #ffc107;
    transform: scale(0.9);
  }
</style>
