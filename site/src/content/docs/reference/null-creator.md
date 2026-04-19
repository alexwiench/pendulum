---
title: Null Creator
description: Create a null controller positioned at the visual center of your selection.
---

The Null Creator button (on the right side of the panel) creates a null object controller in the active composition.

## With Layers Selected

The null is positioned at the **average visual center** of all selected layers, and those layers are automatically **parented to the null**. This is useful for creating a single controller to animate multiple layers together — move or scale the null, and all parented layers follow.

The visual center calculation accounts for each layer's content bounds, anchor point offset, scale, and rotation, so the null lands at the true visible center of the selection, not just the average Position value.

## Without Layers Selected

The null is placed at the center of the composition with no parenting.

## Naming

Nulls are automatically named `Ctrl_01`, `Ctrl_02`, etc., incrementing based on existing `Ctrl_` names in the composition.

## Undo

The entire operation is a single undo step ("Pendulum: Create Null").
