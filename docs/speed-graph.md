# Speed Graph

The speed graph is the main visualization in Pendulum. It shows how fast your animated property is moving at each point across the keyframe span.

## What the Graph Shows

The horizontal axis represents time between two keyframes (left edge = first key, right edge = second key). The vertical axis represents speed -- how rapidly the value is changing at that moment. A tall peak means fast motion; a flat section means the object is barely moving.

## Auto-Scaling

The Y-axis automatically scales so your curve always fills roughly 90% of the canvas height. This keeps the shape visually prominent regardless of actual speed values. The Y-axis is **relative**, not absolute -- two different properties may show similar-looking graphs even if one is moving much faster in real terms.

## Color Coding

By default the graph draws in blue. When ghost curves are present (meaning Pendulum has real frame rate and duration data from your After Effects keyframes), the graph transitions from blue to red based on **frame density**:

- **Blue** -- plenty of frames cover this portion of the motion. Movement will look smooth.
- **Red** -- frames are sparse here. The object covers a lot of ground between frames, so motion may appear choppy or strobed at your current frame rate.

The transition is gradual, not a hard cutoff. Think of it as a heat map: the hotter (redder) a section, the more your audience might perceive judder in that part of the animation.

Without ghost curves, the graph stays the base color since there's no real-world frame rate to evaluate against.

Both the base color and the max-speed color are customizable in Settings > Colors.

## Fill Area

A semi-transparent fill under the curve makes the shape easier to read at a glance. The fill color and opacity can be adjusted in settings.

## Grid Lines

A subtle 4x4 grid provides visual reference. The center lines (50% marks) are slightly brighter to help you gauge symmetry.
