# Chrome Extension

The Chrome extension is the primary platform for Markdown Viewer, offering the most complete feature set.

## Overview

| Feature | Status |
|---------|--------|
| Markdown rendering | ✅ |
| Word export | ✅ |
| All diagram types | ✅ |
| LaTeX formulas | ✅ |
| 29 themes | ✅ |
| Smart caching | ✅ |
| Offline mode | ✅ |

**Version:** 1.4.0  
**Manifest:** V3 (latest Chrome standard)

---

## Installation

### From Chrome Web Store (Recommended)

1. Visit [Chrome Web Store - Markdown Viewer](https://chromewebstore.google.com/detail/markdown-viewer/jekhhoflgcfoikceikgeenibinpojaoi)
2. Click **"Add to Chrome"**
3. Confirm the installation

### Manual Installation (For Developers)

1. Clone the repository
2. Run `npm install && npm run build:chrome`
3. Open `chrome://extensions/`
4. Enable **"Developer mode"**
5. Click **"Load unpacked"**
6. Select the `chrome/dist` folder

---

## Permissions Explained

The extension requests these permissions:

| Permission | Purpose |
|------------|---------|
| `storage` | Save settings and cache locally |
| `unlimitedStorage` | Store diagram cache without limits |
| `offscreen` | Render diagrams in background |
| `scripting` | Inject rendering scripts into pages |
| `downloads` | Save exported Word documents |
| `file:///*` | Access local Markdown files |
| `https://*/*`, `http://*/*` | Access online Markdown files |

**All data stays local.** No information is sent to any server.

---

## Supported File Types

The extension automatically handles these file types:

| Extension | Type |
|-----------|------|
| `.md`, `.markdown` | Markdown documents |
| `.mermaid` | Mermaid diagrams |
| `.vega`, `.vl`, `.vega-lite` | Vega/Vega-Lite charts |
| `.gv` | Graphviz DOT graphs |
| `.infographic` | Infographic charts |

---

## Features

### Automatic Rendering

When you open a supported file:
1. The extension detects the file type
2. Renders the content with syntax highlighting
3. Processes any diagrams or formulas
4. Displays the formatted result

### Export to Word

1. Click the **Download** button or press `Ctrl/Cmd + S`
2. Watch the progress indicator
3. Word document downloads automatically

### Theme Selection

1. Click the extension icon or theme button
2. Browse 29 themes
3. Click to apply instantly

### Smart Caching

- Diagrams are cached locally
- First load: ~5 seconds (for complex docs)
- Subsequent loads: <1 second

---

## Settings

Access settings through:
- Extension popup (click extension icon)
- Right-click menu on extension icon

### Available Settings

| Setting | Default | Options |
|---------|---------|---------|
| Default theme | Default | Any of 29 themes |
| Cache size | 1000 items | 100-5000 |
| Auto-detect URLs | Enabled | On/Off |

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Export to Word | `Ctrl/Cmd + S` |
| Toggle TOC | `Ctrl/Cmd + B` |
| Zoom in | `Ctrl/Cmd + +` |
| Zoom out | `Ctrl/Cmd + -` |
| Reset zoom | `Ctrl/Cmd + 0` |

---

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Google Chrome | ✅ Full support (88+) |
| Microsoft Edge | ✅ Full support |
| Brave | ✅ Full support |
| Opera | ✅ Full support |
| Vivaldi | ✅ Full support |
| Arc | ✅ Full support |

Any Chromium-based browser should work.

---

## Troubleshooting

### Extension Not Working?

1. **Check if enabled:** Go to `chrome://extensions/` and verify it's turned on
2. **File access:** For local files, enable "Allow access to file URLs"
3. **Restart browser:** Try closing and reopening Chrome
4. **Reinstall:** Remove and reinstall the extension

### Diagrams Not Rendering?

1. **Wait for completion:** Complex diagrams take time
2. **Check syntax:** Verify your Mermaid/DOT/Vega syntax
3. **Clear cache:** Try clearing the diagram cache in settings

### Export Fails?

1. **Check permissions:** Ensure download permission is granted
2. **Disk space:** Verify you have disk space available
3. **Try again:** Some complex exports may need a second attempt

---

## Privacy & Security

- ✅ Manifest V3 compliant (latest Chrome security standard)
- ✅ All processing local
- ✅ No external requests
- ✅ No tracking or analytics
- ✅ Open source and auditable

---

## Updates

The extension updates automatically through Chrome Web Store. To check your version:

1. Go to `chrome://extensions/`
2. Find Markdown Viewer
3. Version shown under the name

---

## Source Code

GitHub: [xicilion/markdown-viewer-extension](https://github.com/xicilion/markdown-viewer-extension)

The `chrome/` directory contains all Chrome-specific code.
