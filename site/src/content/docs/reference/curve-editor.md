---
title: Curve Editor
description: Shape easing by dragging influence handles on the speed graph canvas.
---

The curve editor is how you shape easing in Pendulum. Two influence handles sit on the baseline of the speed graph, and you drag them to sculpt the acceleration and deceleration of your animation.

## Influence Handles

There are two handles:

- **In handle** (left side): Controls the ease-out of the starting keyframe — how the motion leaves the first key. Dragging it further right adds more gradual acceleration.
- **Out handle** (right side): Controls the ease-in of the ending keyframe — how the motion arrives at the second key. Dragging it further left adds more gradual deceleration.

Each handle ranges from 0% to 100% influence, matching After Effects' own influence percentage for keyframe easing.

**Dragging a handle** horizontally adjusts that handle's influence independently.

## Canvas Drag

Dragging anywhere on the canvas (not directly on a handle) adjusts **both** handles at once:

- Moving vertically increases or decreases both influences equally, letting you globally tighten or loosen the curve.
- Moving horizontally shifts the emphasis — more ease on one side, less on the other.

This makes it fast to explore different feels without precision-dragging individual handles.

## Bezier Readout

Below the canvas, a `cubic-bezier(...)` string displays the current control points. This is the standard CSS cubic-bezier notation if you ever need to reference or share the values.

## Applying Easing

- **Auto-apply on** (default): Easing is sent to After Effects the moment you release the mouse after dragging.
- **Auto-apply off**: Click the **Apply** button to send the current curve to After Effects.

When you apply, Pendulum converts your curve into After Effects' KeyframeEase format (influence + speed) and sets it on every selected keyframe pair across all selected layers. The entire operation is a single undo step ("Pendulum: Apply Easing").

## Supported Properties

Pendulum handles all animatable property types:

- **Spatial properties** (like Position): Uses combined distance-based speed.
- **Multi-dimensional properties** (like Scale): Handled per-dimension.
- **Single-value properties** (like Opacity, Rotation): Straightforward value change.

Hold keyframes are always skipped.
