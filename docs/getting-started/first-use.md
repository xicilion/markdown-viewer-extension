# First Use

Now that you have Markdown Viewer installed, let's open your first document!

## Opening Markdown Files

### Method 1: Drag and Drop

The simplest way to open a Markdown file:

1. Open a new Chrome tab
2. Drag your `.md` file from your file manager into the browser window
3. Drop it — Markdown Viewer will automatically render it

### Method 2: Double-Click (Requires File Access)

If you've [enabled file access](file-access.md):

1. Simply double-click any `.md` file
2. It will open directly in Chrome with Markdown Viewer

### Method 3: GitHub and Online Files

Markdown Viewer automatically renders Markdown files on:

- GitHub repositories (raw file view)
- GitLab repositories
- Any URL ending in `.md`

Just navigate to the Markdown file, and it will be rendered automatically.

---

## The Interface

When you open a Markdown file, you'll see:

```
┌─────────────────────────────────────────────────────┐
│  📄 Document Title                    [Toolbar]     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────┐                                        │
│  │ Table   │     Your beautifully rendered         │
│  │ of      │     Markdown content appears          │
│  │ Contents│     here with all formatting,         │
│  │         │     diagrams, and code highlighting   │
│  │ • H1    │                                        │
│  │ • H2    │                                        │
│  │   • H3  │                                        │
│  └─────────┘                                        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Toolbar Options

| Icon | Function | Shortcut |
|------|----------|----------|
| 📥 | Export to Word | `Ctrl/Cmd + S` |
| 🎨 | Change Theme | - |
| 📐 | Change Layout | - |
| 🔍+ | Zoom In | `Ctrl/Cmd + +` |
| 🔍- | Zoom Out | `Ctrl/Cmd + -` |
| 📑 | Toggle TOC | `Ctrl/Cmd + B` |

---

## Exporting to Word

This is the core feature of Markdown Viewer!

### Quick Export

1. Open your Markdown file
2. Click the **Download** button or press `Ctrl/Cmd + S`
3. Watch the progress indicator
4. The `.docx` file downloads automatically

### What Gets Converted

| Markdown Element | Word Result |
|-----------------|-------------|
| Headings | Styled headings |
| Bold/Italic | Formatted text |
| Code blocks | Syntax highlighted |
| Tables | Formatted tables |
| Images | Embedded images |
| Mermaid diagrams | High-res PNG |
| LaTeX formulas | Editable equations |
| Links | Clickable hyperlinks |

---

## Switching Themes

1. Click the **Theme** button in the toolbar
2. Browse the 29 available themes
3. Click a theme to preview it
4. The document updates instantly

### Theme Recommendations

| Use Case | Recommended Theme |
|----------|-------------------|
| Business reports | Business |
| Academic papers | Academic |
| Technical docs | Technical |
| Chinese documents | Heiti or Mixed |
| Creative content | Typewriter, Handwritten |
| General use | Default |

---

## Adjusting the View

### Layout Options

- **Normal** (1000px) - Standard reading width
- **Full Screen** - Uses entire browser width
- **Narrow** (530px) - Preview how it looks in Word

### Zoom

- `Ctrl/Cmd + +` — Zoom in
- `Ctrl/Cmd + -` — Zoom out
- `Ctrl/Cmd + 0` — Reset zoom
- Zoom range: 50% to 400%

### Table of Contents

- Press `Ctrl/Cmd + B` to toggle the sidebar TOC
- Click any heading to jump to that section
- Auto-generated from your document headings

---

## Tips for Best Results

1. **Use standard Markdown syntax** — The more standard your Markdown, the better the conversion

2. **Test complex diagrams first** — For documents with many Mermaid diagrams, do a test export

3. **Check theme compatibility** — Some themes work better with certain content types

4. **Enable caching** — Keep caching enabled for faster repeat opens

---

## Next Steps

- Learn about [enabling file access](file-access.md) for local files
- Explore [all features](../features/README.md) in detail
- See [use cases](../use-cases/technical-docs.md) for real-world examples
