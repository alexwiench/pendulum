# Getting Started

Pendulum is an After Effects panel for shaping keyframe easing with a visual speed graph. Instead of tweaking influence and speed values numerically, you drag curves and see exactly how your motion will accelerate and decelerate -- all in real time.

## Panel Layout

- **Speed graph** (left): The main canvas showing your easing curve as a velocity graph. Two handles along the baseline control the shape.
- **Anchor grid + Null creator** (right): Quick-access tools for repositioning anchor points and creating controller nulls.
- **Preset bar** (below the graph): A strip of saved easing thumbnails you can click to recall.
- **Bottom row**: Auto-apply toggle, Apply button, bezier readout, and a gear icon for settings.

## Basic Workflow

1. Select two or more keyframes on a property in After Effects.
2. Drag the influence handles in Pendulum to shape the ease. The speed graph updates instantly.
3. With **Auto-apply** enabled (the default), easing is sent to After Effects the moment you release the mouse. With it disabled, click **Apply** manually.

That's it. Every apply is a single undo step, so Ctrl+Z / Cmd+Z reverts the entire change at once.

## What Gets Affected

Pendulum operates on the selected keyframes across all selected layers. If no specific keyframes are selected within a property, it targets all keyframes on that property. Hold keyframes are always skipped -- only keyframes with continuous interpolation are modified.
