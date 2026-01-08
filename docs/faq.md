# Frequently Asked Questions

Find answers to common questions about Markdown Viewer.

---

## General

### What is Markdown Viewer?

Markdown Viewer is a browser extension and multi-platform tool that renders Markdown files beautifully and exports them to Word documents with one click.

### Is Markdown Viewer free?

Yes, completely free. No subscriptions, no premium features, no hidden costs.

### Is it open source?

Yes, the entire project is open source under the ISC license. You can view, audit, and contribute to the code on [GitHub](https://github.com/xicilion/markdown-viewer-extension).

---

## Export & Conversion

### Can I edit the exported Word document?

Yes! The exported `.docx` file is a standard Word document. You can:
- Edit text and formatting
- Modify math equations (they're native, not images)
- Adjust styles
- Add content

### Which diagrams are supported?

All major diagram types:

| Type | Examples |
|------|----------|
| **Mermaid** | Flowcharts, sequences, class diagrams, Gantt, ER, state, pie |
| **Graphviz DOT** | Directed graphs, network topology, state machines |
| **Vega/Vega-Lite** | Bar charts, line charts, scatter plots, heatmaps |
| **Infographic** | Statistical charts, presentations |
| **SVG** | Auto-converted to images |

### Are there file size limits?

No hard limits. Documents with 100+ diagrams work fine thanks to smart caching.

### Which Word versions are compatible?

- ✅ Microsoft Word 2016 and later (full support)
- ✅ Microsoft Word 2013 (works well)
- ✅ WPS Office (fully compatible)
- ✅ LibreOffice (some minor differences)

### Can I export to PDF?

Currently Word export only. You can export to Word, then save as PDF from Word. Direct PDF export is planned for a future release.

---

## Privacy & Security

### Will my documents be uploaded?

**Never.** All processing happens locally in your browser. No data is sent to any server.

### Does it require internet?

No. Markdown Viewer works completely offline after installation.

### Is it safe to use with sensitive documents?

Yes. Since everything is processed locally:
- No cloud upload
- No external requests
- No tracking or analytics
- Open source code you can audit

---

## Performance

### Will large documents lag?

No. Markdown Viewer uses several optimizations:
- **Progressive loading**: Text displays instantly
- **Background rendering**: Diagrams render without blocking
- **Smart caching**: Rendered diagrams are cached

### How does caching work?

| Scenario | Load Time |
|----------|-----------|
| First open (50 diagrams) | ~5 seconds |
| Second open (cached) | <1 second |
| Text changes only | Instant |
| One diagram changed | Only that diagram re-renders |

### Does cache use much space?

Default: max 1000 items, approximately 500MB. You can:
- Adjust the limit in settings
- Clear cache anytime
- Let auto-cleanup handle old items

---

## Themes

### How do I switch themes?

1. Click the **Theme** button in the toolbar
2. Browse available themes
3. Click to apply instantly

### Which theme should I use?

| Use Case | Recommended |
|----------|-------------|
| Business reports | Business |
| Academic papers | Academic |
| Technical docs | Technical |
| Chinese documents | Heiti, Mixed |
| Creative content | Typewriter, Handwritten |
| General use | Default |

### Can I customize themes?

Currently not supported. We offer 29 pre-designed themes across 7 categories that cover most needs. Custom themes are planned for future releases.

---

## Diagrams

### What's the difference between Vega and Mermaid?

| Aspect | Mermaid | Vega/Vega-Lite |
|--------|---------|----------------|
| **Best for** | Flowcharts, architecture | Data visualization |
| **Input** | Text-based syntax | JSON specification |
| **Examples** | Sequences, class diagrams | Bar charts, line graphs |

**Use Mermaid** for process flows and architecture.
**Use Vega/Vega-Lite** for data-driven charts.

### How do I create Vega-Lite charts?

Use a `vega-lite` code block with JSON specification:

````markdown
```vega-lite
{
  "data": {"values": [{"x": 1, "y": 2}]},
  "mark": "point",
  "encoding": {
    "x": {"field": "x"},
    "y": {"field": "y"}
  }
}
```
````

See [Vega-Lite examples](https://vega.github.io/vega-lite/examples/) for more.

### My diagram isn't rendering. What's wrong?

1. **Check syntax**: Use the appropriate live editor to validate
   - [Mermaid Live Editor](https://mermaid.live)
   - [Vega Editor](https://vega.github.io/editor/)
2. **Verify language identifier**: Make sure you have ` ```mermaid ` not ` ``` mermaid `
3. **Wait for rendering**: Complex diagrams take a moment

---

## Browser Support

### Which browsers are supported?

| Browser | Support |
|---------|---------|
| Google Chrome | ✅ Full |
| Microsoft Edge | ✅ Full |
| Brave | ✅ Full |
| Opera | ✅ Full |
| Firefox | ✅ Full |
| Safari | ❌ Not available |

### Why doesn't it work on Safari?

Safari doesn't support the required extension APIs. There are no plans for Safari support at this time.

---

## Troubleshooting

### The extension isn't working

1. Check if it's enabled: `chrome://extensions/`
2. For local files: Enable "Allow access to file URLs"
3. Try restarting your browser
4. Reinstall the extension

### Export fails

1. Check download permissions
2. Ensure disk space is available
3. Try with a simpler document first
4. Check browser console for errors

### Diagrams don't render

1. Validate syntax in the appropriate online editor
2. Check browser console for errors
3. Clear cache and reload
4. Simplify the diagram

### Formulas look wrong

1. Verify LaTeX syntax
2. Use standard LaTeX commands
3. Check for missing braces or delimiters

---

## Feature Requests

### How can I request a feature?

Open an issue on [GitHub](https://github.com/xicilion/markdown-viewer-extension/issues) with:
- Clear description of the feature
- Use case / why it's needed
- Examples if applicable

### Will you add X feature?

We consider all requests! Popular planned features:
- Custom themes
- Direct PDF export
- More export formats
- Enhanced customization

---

## Getting Help

### Where can I get help?

- 📖 [Documentation](./README.md) — This GitBook
- 🐛 [Bug Reports](https://github.com/xicilion/markdown-viewer-extension/issues) — GitHub Issues
- 💡 [Feature Requests](https://github.com/xicilion/markdown-viewer-extension/issues) — GitHub Issues
- ⭐ [Star on GitHub](https://github.com/xicilion/markdown-viewer-extension) — Show support

### How can I contribute?

- Report bugs and issues
- Suggest features
- Submit pull requests
- Star the repository
- Share with others
