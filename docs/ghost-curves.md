# Ghost Curves

Ghost curves are translucent overlays that show the **existing easing** on your selected After Effects keyframes. They let you see what you had before making changes, and compare your new curve against the current motion.

## How They Appear

When you have keyframes selected in After Effects, Pendulum reads their current easing and draws it behind your active curve. Ghosts fade in smoothly when the selection changes (fade duration is configurable in settings, default 300ms).

Up to 4 ghost curves display simultaneously, one per selected property that has a valid keyframe pair.

## Color Coding

Each ghost curve gets the next color in a fixed cycle:

1. White
2. Orange
3. Light blue
4. Lavender

This makes it easy to distinguish multiple properties at a glance.

## Opacity Controls

Ghost curves have two independent opacity settings (adjustable in Settings > Ghost Curves):

- **Stroke opacity** (default 0.2): Controls the outline visibility. Set to 0 to hide outlines entirely.
- **Fill opacity** (default 0.03): Controls the semi-transparent fill under each ghost. Set to 0 for outline-only ghosts, or increase for more prominent fills.

## Peak Alignment

When your active curve's peak velocity timing closely matches a ghost curve's peak, a **dashed vertical line** appears in that ghost's color. This alignment indicator helps you match timing between properties -- useful when you want Position and Scale (for example) to hit their fastest point at the same moment.

## Selection Polling

Pendulum checks After Effects for selection changes at a configurable interval (default every 1000ms, range 200--5000ms in settings). Lower values detect changes faster but use slightly more CPU.
