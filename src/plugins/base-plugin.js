/**
 * Base Plugin Class
 * 
 * Abstract base class for diagram plugins in content script and docx-exporter.
 * Each plugin handles one diagram type's AST processing and DOCX conversion.
 */
export class BasePlugin {
  /**
   * @param {string} type - Plugin type identifier (e.g., 'mermaid', 'vega')
   */
  constructor(type) {
    if (this.constructor === BasePlugin) {
      throw new Error('BasePlugin is abstract and cannot be instantiated directly');
    }
    this.type = type;
  }

  /**
   * Get AST node selectors for remark visit
   * @returns {string[]} Array of node types to visit (e.g., ['code'], ['code', 'image'])
   */
  get nodeSelector() {
    return ['code']; // Default: only code blocks
  }

  /**
   * Get language identifier for code blocks
   * @returns {string|null} Language identifier or null for non-code nodes
   */
  get language() {
    return this.type; // Default: type matches language
  }

  /**
   * Extract content from AST node
   * Plugins override this to implement their own node matching logic
   * @param {object} node - AST node
   * @returns {string|null} Extracted content or null if not applicable
   */
  extractContent(node) {
    // Check node type matches selector
    if (!this.nodeSelector.includes(node.type)) {
      return null;
    }

    // Check language for code blocks
    if (this.language && node.lang !== this.language) {
      return null;
    }
    
    return node.value || null;
  }

  /**
   * Create async task data for rendering
   * @param {string} content - Extracted content
   * @returns {object} Task data with code and any extra parameters
   */
  createTaskData(content) {
    return { code: content };
  }

  /**
   * Get extra rendering parameters
   * @returns {object} Extra parameters for renderer
   */
  getRenderParams() {
    return {};
  }

  /**
   * Check if this plugin uses inline rendering
   * @returns {boolean} True for inline (span), false for block (div)
   */
  isInline() {
    return false; // Default: block-level
  }

  /**
   * Check if extracted content is a URL that needs fetching
   * @param {string} content - Extracted content
   * @returns {boolean} True if content is a URL
   */
  isUrl(content) {
    return false; // Default: content is not a URL
  }

  /**
   * Fetch content from URL
   * @param {string} url - URL to fetch
   * @returns {Promise<string>} Fetched content
   */
  async fetchContent(url) {
    throw new Error('fetchContent not implemented');
  }

  /**
   * Create async placeholder element (before rendering)
   * @param {string} id - Placeholder element ID
   * @param {Function} translate - Translation function
   * @returns {string} Placeholder HTML
   */
  createPlaceholderElement(id, translate) {
    // Generate translation key dynamically based on type
    const typeLabelKey = `async_placeholder_type_${this.type.replace(/-/g, '')}`;
    const typeLabel = translate(typeLabelKey) || '';
    
    // If no translation found, use type as fallback
    const resolvedTypeLabel = typeLabel || this.type;
    const processingText = translate('async_processing_message', [resolvedTypeLabel, ''])
      || `Processing ${resolvedTypeLabel}...`;

    if (this.isInline()) {
      return `<span id="${id}" class="async-placeholder ${this.type}-placeholder inline-placeholder">
      <span class="async-loading">
        <span class="async-spinner"></span>
        <span class="async-text">${processingText}</span>
      </span>
    </span>`;
    }

    return `<div id="${id}" class="async-placeholder ${this.type}-placeholder">
    <div class="async-loading">
      <div class="async-spinner"></div>
      <div class="async-text">${processingText}</div>
    </div>
  </div>`;
  }

  /**
   * Create placeholder HTML for rendered content (after rendering)
   * @param {string} id - Placeholder element ID
   * @param {object} pngResult - Render result with base64, width, height
   * @returns {string} HTML string
   */
  createPlaceholderHTML(id, pngResult) {
    const displayWidth = Math.round(pngResult.width / 4);
    
    if (this.isInline()) {
      // Inline rendering: use <span> to preserve text flow
      return `<span class="diagram-inline" style="display: inline-block;">
        <img src="data:image/png;base64,${pngResult.base64}" alt="${this.type} diagram" width="${displayWidth}px" style="vertical-align: middle;" />
      </span>`;
    }
    
    // Block rendering: use <div> with centering
    return `<div class="diagram-block" style="text-align: center; margin: 20px 0;">
      <img src="data:image/png;base64,${pngResult.base64}" alt="${this.type} diagram" width="${displayWidth}px" />
    </div>`;
  }

  /**
   * Create error HTML
   * @param {string} errorMessage - Localized error message
   * @returns {string} Error HTML
   */
  createErrorHTML(errorMessage) {
    return `<pre style="background: #fee; border-left: 4px solid #f00; padding: 10px; font-size: 12px;">${errorMessage}</pre>`;
  }

  /**
   * Replace placeholder with rendered content
   * @param {string} id - Placeholder element ID
   * @param {object} pngResult - Render result
   */
  replacePlaceholder(id, pngResult) {
    const placeholder = document.getElementById(id);
    if (placeholder) {
      placeholder.outerHTML = this.createPlaceholderHTML(id, pngResult);
    }
  }

  /**
   * Show error in placeholder
   * @param {string} id - Placeholder element ID
   * @param {Error} error - Error object
   * @param {Function} translate - Translation function
   * @param {Function} escapeHtml - HTML escape function
   */
  showError(id, error, translate, escapeHtml) {
    const placeholder = document.getElementById(id);
    if (placeholder) {
      const errorDetail = escapeHtml(error.message || '');
      // Use generic error message with type placeholder
      const localizedError = translate('async_processing_error', [this.type, errorDetail]) 
        || `${this.type} error: ${errorDetail}`;
      placeholder.outerHTML = this.createErrorHTML(localizedError);
    }
  }

  /**
   * Create remark plugin function
   * @param {object} renderer - Renderer instance
   * @param {Function} asyncTask - Async task creator
   * @param {Function} translate - Translation function
   * @param {Function} escapeHtml - HTML escape function
   * @param {Function} visit - unist-util-visit function
   * @returns {Function} Remark plugin function
   */
  createRemarkPlugin(renderer, asyncTask, translate, escapeHtml, visit) {
    const plugin = this;
    
    return function() {
      return (tree) => {
        // Visit all node types
        for (const nodeType of plugin.nodeSelector) {
          visit(tree, nodeType, (node, index, parent) => {
            const content = plugin.extractContent(node);
            if (!content) return;

            // Determine initial status: URLs need fetching
            const initialStatus = plugin.isUrl(content) ? 'fetching' : 'ready';

            const result = asyncTask(
              async (data) => {
                const { id, code } = data;
                try {
                  const extraParams = plugin.getRenderParams();
                  const pngResult = await renderer.render(plugin.type, code, extraParams);
                  plugin.replacePlaceholder(id, pngResult);
                } catch (error) {
                  plugin.showError(id, error, translate, escapeHtml);
                }
              },
              plugin.createTaskData(content),
              plugin,
              translate,
              initialStatus
            );

            // For URLs, start fetching immediately
            if (plugin.isUrl(content)) {
              plugin.fetchContent(content)
                .then(fetchedContent => {
                  result.task.data.code = fetchedContent;
                  result.task.setReady();
                })
                .catch(error => {
                  result.task.setError(error);
                });
            }

            parent.children[index] = result.placeholder;
          });
        }
      };
    };
  }

  /**
   * Convert content to DOCX paragraph or inline image
   * @param {object} renderer - Renderer instance
   * @param {string} content - Content to convert
   * @param {object} docxHelpers - DOCX helper functions
   * @returns {Promise<object>} DOCX Paragraph or ImageRun (depending on isInline())
   */
  async convertToDOCX(renderer, content, docxHelpers) {
    const { Paragraph, TextRun, ImageRun, AlignmentType } = docxHelpers;
    const inline = this.isInline();

    if (!renderer) {
      if (inline) {
        return new TextRun({
          text: `[${this.type} - Renderer not available]`,
          italics: true,
          color: '666666',
        });
      }
      return new Paragraph({
        children: [
          new TextRun({
            text: `[${this.type} Diagram - Renderer not available]`,
            italics: true,
            color: '666666',
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { before: 240, after: 240 },
      });
    }

    try {
      const extraParams = this.getRenderParams();
      const pngResult = await renderer.render(this.type, content, extraParams);

      // Convert base64 to Uint8Array
      const binaryString = atob(pngResult.base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Calculate display size (1/4 of original PNG size)
      let displayWidth = Math.round(pngResult.width / 4);
      let displayHeight = Math.round(pngResult.height / 4);

      // Apply max-width constraint (6 inches)
      const maxWidthInches = 6;
      const maxWidthPixels = maxWidthInches * 96; // 576 pixels

      if (displayWidth > maxWidthPixels) {
        const ratio = maxWidthPixels / displayWidth;
        displayWidth = maxWidthPixels;
        displayHeight = Math.round(displayHeight * ratio);
      }

      const imageRun = new ImageRun({
        data: bytes,
        transformation: {
          width: displayWidth,
          height: displayHeight,
        },
        type: 'png',
        altText: {
          title: `${this.type} Image`,
          description: `${this.type} image`,
          name: `${this.type}-image`,
        },
      });

      // Return ImageRun directly for inline, or wrapped in Paragraph for block
      if (inline) {
        return imageRun;
      }

      return new Paragraph({
        children: [imageRun],
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 240 },
      });
    } catch (error) {
      console.warn(`Failed to render ${this.type}:`, error);
      
      if (inline) {
        return new TextRun({
          text: `[${this.type} Error: ${error.message}]`,
          italics: true,
          color: 'FF0000',
        });
      }
      
      return new Paragraph({
        children: [
          new TextRun({
            text: `[${this.type} Error: ${error.message}]`,
            italics: true,
            color: 'FF0000',
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { before: 240, after: 240 },
      });
    }
  }
}
