# Settings

Open the settings panel by clicking the **gear icon** in the bottom-right corner of the panel.

## Behavior

| Setting | Description | Default |
|---------|-------------|---------|
| Auto-apply | Automatically apply easing to After Effects keyframes when you release the mouse after dragging. When off, use the Apply button manually. | On |

## Colors

All color pickers use After Effects' native color dialog.

| Setting | Description | Default |
|---------|-------------|---------|
| Playhead | Color of the timeline playhead indicator | Blue (#4A9EFF) |
| Graph | Base color of the speed graph at normal speeds | Blue (#4A9EFF) |
| Max Speed | Color the graph transitions to at high speeds / sparse frame density | Red (#FF4A4A) |

## Timing

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Ghost Fade | 50--2000 ms | 300 ms | Duration of the fade-in animation when ghost curves appear |
| Playhead Poll | 50--500 ms | 100 ms | How often Pendulum checks After Effects' current time for the playhead. Lower = more responsive, slightly more CPU. |
| Selection Poll | 200--5000 ms | 1000 ms | How often Pendulum checks for keyframe selection changes in After Effects |

## Ghost Curves

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Stroke Opacity | 0--1 | 0.2 | Opacity of ghost curve outlines. Set to 0 to hide outlines. |
| Fill Opacity | 0--1 | 0.03 | Opacity of the fill area under ghost curves. Set to 0 for outline-only. |

## Data

| Action | Description |
|--------|-------------|
| Export Settings | Downloads your current settings as a `pendulum-settings.json` file |
| Import Settings | Loads settings from a previously exported JSON file |
| Reset to Defaults | Restores all settings to factory values (asks for confirmation first) |

Settings are saved automatically and persist between After Effects sessions.
