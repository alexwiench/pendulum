---
title: Playhead
description: A timeline indicator that tracks After Effects' current time across the speed graph.
---

The playhead is a vertical line with a diamond marker at the top that tracks After Effects' current time indicator across the speed graph.

## When It Appears

The playhead is visible when ghost curves are present, because it needs the keyframe timing data to know where "here" is on the graph. It shows your position between the first and last selected keyframe times.

## Behavior

- **Smooth animation**: The playhead eases toward its target position rather than jumping, creating fluid motion as you scrub the After Effects timeline.
- **Edge fading**: As the playhead approaches the left or right edge of the graph, it fades out smoothly. When the current time is outside the keyframe span, the playhead slides off-screen and disappears.

## Polling

Pendulum queries After Effects' current time at a configurable rate (default 100ms, range 50–500ms in Settings > Timing). Lower values feel more responsive but use slightly more CPU.

## Customization

The playhead color is configurable in Settings > Colors (default: blue, matching the graph color).
