# Pendulum — After Effects Easing & Utility Plugin

## Overview

A CEP panel for After Effects built on **Bolt CEP** that provides:

1. **Bezier Easing Editor** — Visual curve editor to create and apply easing to selected keyframes (single or batch)
2. **Anchor Point Mover** — 9-point grid to reposition layer anchor points without shifting the layer
3. **Null Object Creator** — One-click null creation, optionally parented to selected layers

---

## Stack

| Layer | Technology | Why |
|---|---|---|
| Scaffold / Build | **Bolt CEP** (Vite-based) | HMR in dev, ExtendScript transpiling, ZXP signing, dual CEP/UXP target |
| Panel UI | Vanilla JS + `<canvas>` | No UI framework needed — the panel is compact and canvas-heavy |
| AE Scripting | ExtendScript (.jsx) | Full keyframe velocity/influence API access |
| Canvas | HTML `<canvas>` | Bezier curve editor with draggable control handles |

### Why Bolt CEP?

- **HMR** — instant UI refresh during development instead of manually reloading the panel in AE
- **ExtendScript bundling** — write modern JS, Bolt transpiles it down to ES3 for AE's ExtendScript engine
- **ZXP signing** — built-in packaging for distribution
- **CEP + UXP dual target** — future-proofs us for when Adobe matures UXP in AE
- **Vite under the hood** — fast builds, native ES module dev server

### Why no UI framework?

The UI is a canvas curve editor, a 3×3 button grid, and a toolbar. Vanilla JS is simpler, faster, and one less abstraction between us and the `<canvas>` API. Bolt CEP supports React/Svelte/Vue if we change our minds later.

---

## Directory Structure (Bolt CEP)

Bolt CEP generates this scaffold. We customize from here:

```
pendulum/
├── src/
│   ├── js/                         # Panel UI (Vite entry)
│   │   ├── main.ts                 # Entry point, UI wiring
│   │   ├── curve-editor/
│   │   │   ├── canvas.ts           # Canvas rendering — bezier curve, grid, handles
│   │   │   ├── interaction.ts      # Drag logic for control points
│   │   │   ├── presets.ts          # Named ease presets (ease-in, overshoot, etc.)
│   │   │   └── conversion.ts      # Bezier ↔ AE KeyframeEase conversion (critical)
│   │   ├── anchor-mover/
│   │   │   └── grid.ts            # 9-point grid UI + click handlers
│   │   ├── null-creator/
│   │   │   └── button.ts          # Null creation button logic
│   │   └── bridge.ts              # Typed wrapper around CSInterface.evalScript
│   ├── jsx/                        # ExtendScript (transpiled by Bolt)
│   │   ├── index.ts                # Dispatcher — routes calls from panel
│   │   ├── easing.ts               # Apply easing to selected keyframes
│   │   ├── anchor.ts               # Move anchor point + compensate position
│   │   └── nulls.ts                # Create and parent null objects
│   └── index.html                  # Panel HTML shell
├── public/
│   └── icons/                      # Panel icons for AE
├── cep.config.ts                   # Bolt CEP config (extension ID, AE version range, etc.)
├── package.json
├── tsconfig.json
└── vite.config.ts
```

> **Note:** Bolt CEP lets us write `.ts` in the `jsx/` folder — it transpiles to ExtendScript-compatible ES3. We get modern syntax and type safety for the AE scripting layer.

---

## Feature Specs

### 1. Bezier Easing Editor

**UI:** `<canvas>` element rendering a cubic bezier curve with two draggable control handles.

**Behavior:**
- User drags control points to shape the ease-in / ease-out curve
- The curve maps to keyframe **temporal influence** and **speed** values in AE
- Preset buttons below the canvas for common eases (e.g., ease-in, ease-out, ease-in-out, overshoot)
- "Apply" button sends the current curve to **all selected keyframes** across all selected layers
- Visual reference curve (dashed, secondary color) to compare before/after

**ExtendScript mapping:**
```
// AE keyframe easing is controlled via:
// property.setTemporalEaseAtKey(keyIndex, [inEase], [outEase])
// where each ease = new KeyframeEase(speed, influence)
//
// Our bezier control points (x1, y1, x2, y2) in normalized 0–1 space
// need to be converted to influence (0–100%) and speed values.
```

**Conversion logic (`conversion.ts` — the hardest part of the plugin):**
- Canvas bezier uses P0=(0,0), P1=(x1,y1), P2=(x2,y2), P3=(1,1)
- `influence_in` ≈ x1 × 100 (percentage of keyframe interval affecting ease-out of the key)
- `influence_out` ≈ (1 - x2) × 100 (percentage affecting ease-in of the next key)
- Speed is derived from the value change rate — depends on the property's value delta and time delta between keyframes
- **This is non-trivial** — the conversion is context-dependent (speed values change based on the actual keyframe values and timing). Needs extensive testing with real keyframe data.
- Consider referencing how tools like Flow and Motion handle this — the community has documented some of the math.

**Batch apply flow:**
```
1. app.beginUndoGroup("Pendulum: Apply Ease")
2. for each selectedLayer in activeComp.selectedLayers:
3.   for each selectedProp in layer (walk property tree):
4.     for each selected keyframe index:
5.       compute speed based on prop value delta + time delta
6.       setTemporalEaseAtKey(index, [inEase], [outEase])
7. app.endUndoGroup()
```

### 2. Anchor Point Mover

**UI:** 3×3 grid of clickable dots.

```
TL  TC  TR
ML  MC  MR
BL  BC  BR
```

**Behavior:**
- Click a dot → move anchor point to that position relative to layer bounds
- Position is compensated so the layer doesn't visually shift
- Works on multiple selected layers simultaneously
- Handles both 2D and 3D layers

**ExtendScript logic:**
```
1. rect = layer.sourceRectAtTime(comp.time, false)
2. targetAnchor = calculate from grid position + rect bounds
3. delta = targetAnchor - currentAnchor
4. layer.anchorPoint.setValue(targetAnchor)
5. layer.position.setValue(currentPos + delta)
   // For parented layers: account for parent transform chain
```

### 3. Null Object Creator

**UI:** Single icon button in the bottom toolbar.

**Behavior:**
- Click → creates a null object in the active comp
- If layers are selected: null is positioned at the average center of selected layers, and those layers are parented to it
- Auto-naming: `Ctrl_01`, `Ctrl_02`, etc.
- All operations wrapped in a single undo group

---

## UI Design Notes

- **Dark theme** matching AE native: `#232323` bg, `#1a1a1a` panels, `#e0e0e0` text
- Compact — works well at ~300px wide
- Layout: easing editor left (~60%), anchor grid right (~40%), toolbar bottom
- Accent colors: amber/orange `#f5a623` for the active curve, blue `#4a9eff` for reference curve
- Minimal chrome — no heavy borders, subtle hover states

---

## Development Setup

### Prerequisites

- Node.js 18+
- After Effects CC 2023+ (CEP 11)

### Init with Bolt CEP

```bash
npx create-bolt-cep pendulum
# Select: Vanilla (no framework)
# Select: After Effects
# Select: CEP
```

### Enable unsigned extensions (dev mode)

**macOS:**
```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
```

**Windows:**
```
HKEY_CURRENT_USER\Software\Adobe\CSXS.11
PlayerDebugMode = "1" (String)
```

### Development

```bash
npm run dev    # Starts Vite dev server with HMR
npm run build  # Builds production panel
npm run zxp    # Signs and packages as .zxp for distribution
```

---

## Key Risks & Decisions

| Topic | Status | Notes |
|---|---|---|
| Bezier ↔ AE ease conversion | 🔴 Hard | Context-dependent (speed varies by keyframe value/time delta). Core IP — needs dedicated spike. |
| Walking the property tree | 🟡 Medium | AE's property model is deeply nested. Need a recursive walker that finds selected keyframes across all property types. |
| 3D layers + anchor point | 🟡 Medium | Anchor/position are 3-value arrays for 3D layers. Grid logic needs to handle z. |
| Parented layer compensation | 🟡 Medium | Anchor offset must account for parent transform chain when compensating position. |
| Undo grouping | 🟢 Easy | All ExtendScript ops wrapped in `beginUndoGroup` / `endUndoGroup`. |
| Performance (many keyframes) | 🟢 Easy | Use `app.beginSuppressDialogs()` and disable expression evaluation during batch ops. |
| Distribution | 🟢 Easy | Bolt CEP handles ZXP signing. Consider aescripts.com for marketplace. |

---

## Next Steps

1. **`npx create-bolt-cep pendulum`** — scaffold the project
2. **Curve editor canvas** — rendering + draggable handles (pure UI, no AE connection yet)
3. **Bezier ↔ AE conversion spike** — research and test the math with real keyframes
4. **ExtendScript: batch ease apply** — wire the conversion to actual keyframe manipulation
5. **Anchor grid UI + ExtendScript** — straightforward, good momentum builder
6. **Null creator** — simplest feature, quick win
7. **Presets & polish** — save/load ease presets, refine dark theme
