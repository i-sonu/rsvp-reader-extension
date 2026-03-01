# RSVP Reader — Chrome Extension

**Speed-read any selected text** with a fullscreen overlay, red ORP (Optimal Recognition Point) anchor letter, and intelligent word timing.

## Features

- **Right-click → Start RSVP** on any selected text
- **Red anchor letter** stays fixed at screen center — no eye movement needed
- **Smart timing** — longer words get more time, punctuation triggers a pause
- **Keyboard controls** — Space (pause), Esc (close), ←→ (skip words)
- **Customizable** — WPM, length weight, punctuation boost, anchor position
- **Privacy-first** — all processing is local, no data leaves your browser

## Install (Load Unpacked)

1. Open `chrome://extensions` in Chrome/Edge
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `rsvp-extension` folder
5. Done! The RSVP Reader icon appears in your toolbar

## Usage

1. Select any text on a webpage
2. Right-click → **Start RSVP**
3. The overlay launches — read at speed!
4. Press **Space** to pause/resume
5. Press **Esc** or click **✕** to close

## Settings

Click the extension icon in the toolbar to open settings:

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| WPM | 400 | 100–1000 | Words per minute |
| Length Weight | 0.6 | 0–1 | How strongly word length affects display time |
| Punctuation Pause | 1.5× | 1–3× | Extra time for punctuation-ending words |
| Anchor Position | 35% | 10–60% | Where the red focus letter sits within each word |
| Anchor Underline | Off | On/Off | Underline the anchor (colorblind accessibility) |

## Algorithm

The core algorithm is defined in [`rsvp.py`](../rsvp.py) and ported to [`rsvp.js`](rsvp.js):

1. **Total time** = `(word_count / WPM) × 60` seconds
2. **Per-word weight** = `1 + LENGTH_STRENGTH × ((word_length − avg_length) / avg_length)`
3. Words ending in `.,;:!?` get weight multiplied by `PUNCTUATION_BOOST`
4. Weights are normalized so all delays sum to exactly `total_time`
5. **Anchor index** = `floor(word_length × ANCHOR_RATIO)`, clamped to valid range

## File Structure

```
rsvp-extension/
├── manifest.json      # Chrome MV3 manifest
├── background.js      # Service worker: context menu + injection
├── content.js         # Overlay DOM builder + controls
├── rsvp.js            # Core RSVP algorithm (port of rsvp.py)
├── ui.css             # Overlay styles
├── settings.js        # Settings helpers
├── popup.html         # Settings popup
├── popup.css          # Popup styles
├── popup.js           # Settings UI logic
├── icons/             # Extension icons
└── README.md          # This file
```

## Permissions

Only these Chrome permissions are used:
- `contextMenus` — right-click menu
- `scripting` — inject content scripts
- `activeTab` — access current tab
- `storage` — persist settings

No host permissions. No network requests. Your data stays local.
