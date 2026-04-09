# Pendulum — After Effects Easing & Utility Plugin

## Overview

A CEP panel for After Effects built on **Bolt CEP** that provides:

1. **Bezier Easing Editor** — Visual curve editor to create and apply easing to selected keyframes (single or batch)
2. **Anchor Point Mover** — 9-point grid to reposition layer anchor points without shifting the layer
3. **Scripts** — Drop-in `.jsx` utilities that appear as buttons in the side grid (e.g. null creator, wiggle with sliders)

---

## Stack

| Layer | Technology | Why |
|---|---|---|
| Scaffold / Build | **Bolt CEP** (Vite-based) | HMR in dev, ExtendScript transpiling, ZXP signing, dual CEP/UXP target |
| Panel UI | **Svelte 5** + `<canvas>` | Runes-based reactivity, compact components |
| AE Scripting | ExtendScript (.jsx) | Full keyframe velocity/influence API access |
| Canvas | HTML `<canvas>` | Bezier curve editor with draggable control handles |

### Why Bolt CEP?

- **HMR** — instant UI refresh during development instead of manually reloading the panel in AE
- **ExtendScript bundling** — write modern JS, Bolt transpiles it down to ES3 for AE's ExtendScript engine
- **ZXP signing** — built-in packaging for distribution
- **CEP + UXP dual target** — future-proofs us for when Adobe matures UXP in AE
- **Vite under the hood** — fast builds, native ES module dev server

### Why Svelte 5?

Lightweight reactive components with runes (`$state`, `$derived`). The panel is compact — mostly a canvas editor, a button grid, and a few stores — so Svelte's small runtime and compile-time approach is a good fit.

---

## Directory Structure (Bolt CEP)

Bolt CEP generates this scaffold. We customize from here:

```
pendulum/
├── src/
│   ├── js/                         # Panel UI (Svelte 5 + Vite)
│   │   ├── main/
│   │   │   ├── main.svelte         # Root component
│   │   │   ├── CurveEditor.svelte  # Canvas bezier editor + side grid
│   │   │   ├── AnchorGrid.svelte   # 9-point anchor mover
│   │   │   ├── SettingsPanel.svelte # Settings overlay
│   │   │   ├── settings.svelte.ts  # Settings store (localStorage)
│   │   │   ├── presets.svelte.ts   # Preset store
│   │   │   ├── user-scripts.svelte.ts # Script discovery & execution
│   │   │   └── curve-math.ts       # Speed graph computation
│   │   └── lib/
│   │       ├── utils/bolt.ts       # evalTS/evalES/evalFile bridge to ExtendScript
│   │       └── cep/node.ts         # Node.js module access (fs, path, os)
│   ├── jsx/                        # ExtendScript (transpiled by Bolt to ES3)
│   │   ├── index.ts                # Dispatcher — registers functions under namespace
│   │   ├── aeft/easing.ts          # Apply easing to selected keyframes
│   │   ├── aeft/anchor.ts          # Move anchor point + compensate position
│   │   └── aeft/aeft-utils.ts      # Shared AE helpers
│   ├── scripts/                    # User scripts (.jsx) — copied to dist at build
│   │   ├── 01-create-null.jsx      # Null creator with auto-parenting
│   │   └── 02-wiggle-with-sliders.jsx # Wiggle expression with slider controls
│   └── shared/shared.ts            # Namespace, version exports
├── cep.config.ts                   # Bolt CEP config (extension ID, hosts, copyAssets)
├── package.json
├── tsconfig.json
└── vite.config.ts
```

> **Note:** Bolt CEP lets us write `.ts` in the `jsx/` folder — it transpiles to ExtendScript-compatible ES3. Scripts in `src/scripts/` are raw `.jsx` files that run as-is via `$.evalFile()` — they are NOT transpiled.

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

### 3. Scripts

Standalone `.jsx` ExtendScript files that appear as icon buttons in the side grid next to the bezier editor. Scripts are standard AE ExtendScript — the same format as File > Scripts > Run Script File.

**Location:** `src/scripts/` — copied to `dist/cep/scripts/` at build via `copyAssets` in `cep.config.ts`.

**Execution:** Loaded at runtime via `$.evalFile()`. Not compiled or transpiled — must be valid ES3.

**Discovery:** On panel mount, the store scans `<extension_root>/scripts/` for `.jsx` files, parses metadata from the first `/** */` block comment, and renders buttons sorted by filename.

**Filename prefix controls sort order:** `01-create-null.jsx` appears before `02-wiggle-with-sliders.jsx`.

#### Script metadata format

Metadata is declared in a JSDoc-style `/** */` block comment at the top of the file using `@tag` fields. All fields are optional.

```jsx
/**
 * @name Create Null
 * @tooltip Creates a null at the center of selected layers
 * @icon <svg viewBox="0 0 16 16" width="70%" height="70%" fill="none" stroke="currentColor" stroke-width="1.5">...</svg>
 * @author John Doe
 * @version 1.0.0
 * @url https://example.com
 * @ae 24.0
 */
```

| Field | Purpose | Fallback |
|---|---|---|
| `@name` | Display name | Humanized filename (strips prefix, replaces `-` with spaces, title-cased) |
| `@tooltip` | Hover text on the button | Falls back to `@name` |
| `@icon` | Inline SVG for the button | Generic document icon |
| `@author` | Script author | — |
| `@version` | Version string | — |
| `@url` | Link to source or docs | — |
| `@ae` | Minimum AE version | — |

> **Note:** `@tags` must be inside a `/** */` block comment, not `//` line comments. ExtendScript treats `//@` in line comments as preprocessor directives, but `@` inside block comments is safe.

#### Script template

```jsx
/**
 * @name My Script
 * @tooltip What it does in a few words
 * @icon <svg viewBox="0 0 16 16" width="70%" height="70%" fill="none" stroke="currentColor" stroke-width="1.5">...</svg>
 */
(function() {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        alert("Open a composition first.");
        return;
    }

    app.beginUndoGroup("Pendulum: My Script");

    // ... AE scripting API calls ...

    app.endUndoGroup();
})();
```

**Conventions:**
- Wrap in an IIFE to avoid polluting the global scope
- Use `var` — no `let`, `const`, arrow functions, or template literals (ES3 only)
- Wrap operations in `app.beginUndoGroup()` / `app.endUndoGroup()`
- Validate comp and selection before acting; use `alert()` for user-facing errors

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
