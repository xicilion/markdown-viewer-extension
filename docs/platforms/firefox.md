# Firefox Extension

Markdown Viewer is available for Firefox with full feature support.

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
**Manifest:** V3  
**Minimum Firefox:** 140.0

---

## Installation

### From Firefox Add-ons

1. Visit [Firefox Add-ons - Markdown Viewer](https://addons.mozilla.org/firefox/addon/markdown-viewer-extension/)
2. Click **"Add to Firefox"**
3. Confirm the installation

### Manual Installation (For Developers)

1. Clone the repository
2. Run `npm install && npm run build:firefox`
3. Open `about:debugging`
4. Click **"This Firefox"**
5. Click **"Load Temporary Add-on"**
6. Select any file in the `firefox/dist` folder

---

## Firefox-Specific Features

### Background Page

Unlike Chrome's service worker, Firefox uses a background page for better compatibility with WebAssembly-based renderers.

### WebRequest Handling

Firefox version includes `webRequest` and `webRequestBlocking` permissions for more reliable file type detection.

---

## Permissions Explained

| Permission | Purpose |
|------------|---------|
| `storage` | Save settings and cache |
| `unlimitedStorage` | Store diagram cache |
| `downloads` | Save Word exports |
| `tabs` | Detect markdown files |
| `activeTab` | Process current tab |
| `scripting` | Inject rendering scripts |
| `webRequest` | Detect file types |
| `file:///*` | Access local files |
| `https://*/*`, `http://*/*` | Access online files |

---

## Supported File Types

| Extension | Type |
|-----------|------|
| `.md`, `.markdown` | Markdown documents |
| `.mermaid` | Mermaid diagrams |
| `.vega`, `.vl`, `.vega-lite` | Vega/Vega-Lite charts |
| `.gv` | Graphviz DOT graphs |
| `.infographic` | Infographic charts |

---

## File Access Setup

To open local Markdown files:

1. Go to `about:addons`
2. Find Markdown Viewer
3. Click the extension name
4. Under **Permissions**, enable file access

---

## Known Differences from Chrome

| Feature | Chrome | Firefox |
|---------|--------|---------|
| Background | Service Worker | Background Page |
| Offscreen API | Used | Not available (alternative used) |
| Performance | Slightly faster | Comparable |

Both versions provide the same user-facing features.

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Export to Word | `Ctrl + S` / `Cmd + S` |
| Toggle TOC | `Ctrl + B` / `Cmd + B` |
| Zoom in | `Ctrl + +` / `Cmd + +` |
| Zoom out | `Ctrl + -` / `Cmd + -` |
| Reset zoom | `Ctrl + 0` / `Cmd + 0` |

---

## Troubleshooting

### Extension Not Loading?

1. Check Firefox version (requires 140.0+)
2. Verify extension is enabled in `about:addons`
3. Try disabling and re-enabling
4. Restart Firefox

### Local Files Not Opening?

1. Go to `about:addons`
2. Find Markdown Viewer → Permissions
3. Ensure file access is enabled

### Diagrams Not Rendering?

1. Check browser console for errors
2. Verify diagram syntax is correct
3. Try clearing cache and reloading

---

## Development

### Build for Firefox

```bash
npm install
npm run build:firefox
```

### Test in Firefox

```bash
# Load in about:debugging
# Or use web-ext:
web-ext run --source-dir firefox/dist
```

### Firefox-Specific Code

Firefox-specific implementations are in the `firefox/` directory:
- `manifest.json` — Firefox-specific manifest
- `src/host/` — Background page implementation
- `src/webview/` — Firefox-optimized rendering

---

## Privacy & Security

- ✅ All processing local
- ✅ No external requests
- ✅ No tracking
- ✅ Open source

Same privacy guarantees as the Chrome version.

---

## Source Code

GitHub: [xicilion/markdown-viewer-extension](https://github.com/xicilion/markdown-viewer-extension)

Firefox-specific code is in the `firefox/` directory.
