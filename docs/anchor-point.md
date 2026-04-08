# Anchor Point Grid

The anchor point grid is a 3x3 button grid on the right side of the panel that lets you reposition a layer's anchor point to any of 9 standard positions with one click.

## Positions

```
TL   TC   TR      (Top Left, Top Center, Top Right)
ML   MC   MR      (Middle Left, Middle Center, Middle Right)
BL   BC   BR      (Bottom Left, Bottom Center, Bottom Right)
```

These positions are calculated from the layer's visible content bounds -- not the comp or layer dimensions.

## Position Compensation

When the anchor point moves, Pendulum adjusts the layer's Position value so the layer **does not visually shift** in the composition. This is the same concept as After Effects' Pan Behind (Anchor Point) tool, but accessible in one click instead of manual dragging.

## Multi-Layer Support

The anchor point change applies to all currently selected layers simultaneously.

## Layer Compatibility

- **2D and 3D layers**: Both work. For 3D layers, the Z component of the anchor point is preserved.
- **Parented layers**: Handled correctly -- Pendulum accounts for the parent-child coordinate space.
- **Separated dimensions**: Works when Position X/Y are separated into individual properties.
- **Cameras and lights**: Skipped (they don't have visible content bounds).

## Undo

The entire operation is a single undo step ("Pendulum: Move Anchor Point"), regardless of how many layers are selected.
