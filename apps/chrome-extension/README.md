# Content Capture Chrome Extension

Save links to your personal content archive with one click.

## Installation (Development)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `apps/chrome-extension` folder

## Usage

1. Click the extension icon in your toolbar (or press `Cmd+Shift+S` / `Ctrl+Shift+S`)
2. The current page URL will be shown
3. Optionally add notes
4. Click **Save to Archive**

## Configuration

Click the settings icon (gear) to set your API URL:
- Development: `http://localhost:3000`
- Production: Your deployed URL

## Features

- One-click save from any webpage
- Keyboard shortcut support (`Cmd/Ctrl + Shift + S`)
- Optional notes for each saved item
- Duplicate detection (won't save the same URL twice)
- Dark mode support

## Building for Production

For Chrome Web Store submission:
1. Update the version in `manifest.json`
2. Create a ZIP of the `chrome-extension` folder
3. Upload to Chrome Web Store Developer Dashboard

## Files

```
chrome-extension/
├── manifest.json    # Extension configuration
├── popup.html       # Popup UI
├── popup.css        # Styles (with dark mode)
├── popup.js         # Logic and API calls
└── icons/           # Extension icons
```
