/**
 * HTML Renderer
 * 
 * Renders HTML code blocks to PNG images using html2canvas
 */
import { BaseRenderer } from './base-renderer.js';

export class HtmlRenderer extends BaseRenderer {
  constructor() {
    super('html');
  }

  /**
   * HTML uses a different rendering approach (html2canvas instead of SVG)
   * Override the main render method
   */
  async render(input, themeConfig, extraParams = {}) {
    this.validateInput(input);
    return await this.renderHtmlToPng(input, themeConfig, extraParams);
  }

  /**
   * Render HTML to PNG using html2canvas
   * @param {string} htmlContent - HTML content to render
   * @param {object} themeConfig - Theme configuration
   * @param {object} extraParams - Extra parameters (width)
   * @returns {Promise<{base64: string, width: number, height: number}>}
   */
  async renderHtmlToPng(htmlContent, themeConfig, extraParams = {}) {
    if (typeof html2canvas === 'undefined') {
      throw new Error('html2canvas not loaded');
    }

    // Sanitize HTML before rendering
    const sanitizedHtml = this.sanitizeHtml(htmlContent);
    if (!sanitizedHtml || sanitizedHtml.replace(/\s+/g, '').length <= 0) {
      throw new Error('HTML content is empty after sanitization');
    }

    const container = this.getContainer();
    const targetWidth = extraParams.width || 1200;
    const normalizedTargetWidth = Number.isFinite(targetWidth) && targetWidth > 0 ? targetWidth : null;
    
    // Apply theme font-family to HTML container
    const fontFamily = themeConfig?.fontFamily || "'SimSun', 'Times New Roman', Times, serif";
    container.style.cssText = `display: inline-block; position: relative; background: transparent; padding: 0; margin: 0; width: auto; font-family: ${fontFamily};`;
    container.innerHTML = sanitizedHtml;

    // Give the layout engine a tick in the offscreen document context
    container.offsetHeight;
    await new Promise((resolve) => setTimeout(resolve, 0));

    const rect = container.getBoundingClientRect();
    const widthFallback = normalizedTargetWidth || 1;
    const rawWidth = rect.width || container.scrollWidth || container.offsetWidth || widthFallback;
    const measuredWidth = Math.ceil(rawWidth);
    const captureWidth = measuredWidth > 0 ? measuredWidth : widthFallback;

    container.style.width = `${captureWidth}px`;
    container.style.display = 'block';

    // Calculate scale based on target width
    const scale = this.calculateScale(themeConfig, { width: normalizedTargetWidth, captureWidth });

    // Use html2canvas to capture
    const canvas = await html2canvas(container, {
      backgroundColor: null,
      scale: scale,
      logging: false,
      useCORS: true,
      allowTaint: true,
      width: captureWidth,
      windowWidth: Math.max(captureWidth, normalizedTargetWidth || 0),
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc, element) => {
        // Set willReadFrequently for better performance
        const canvases = clonedDoc.getElementsByTagName('canvas');
        for (let canvas of canvases) {
          if (canvas.getContext) {
            canvas.getContext('2d', { willReadFrequently: true });
          }
        }
      }
    });

    const pngDataUrl = canvas.toDataURL('image/png', 1.0);
    const base64Data = pngDataUrl.replace(/^data:image\/png;base64,/, '');

    // Cleanup
    container.innerHTML = '';
    container.style.cssText = 'display: block; background: transparent;';

    return {
      base64: base64Data,
      width: canvas.width,
      height: canvas.height
    };
  }

  /**
   * Calculate scale for HTML rendering
   * @param {object} themeConfig - Theme configuration
   * @param {object} extraParams - Extra parameters with width and captureWidth
   * @returns {number} Scale factor (fixed at 4)
   */
  calculateScale(themeConfig, extraParams) {
    // HTML rendering uses a fixed scale of 4 for high quality
    return 4;
  }

  /**
   * HTML renderer doesn't use SVG pipeline
   */
  async renderToSvg(input, themeConfig, extraParams) {
    throw new Error('HTML renderer does not use SVG pipeline');
  }

  /**
   * Sanitize HTML content to remove dangerous elements and attributes
   * @param {string} html - Raw HTML content
   * @returns {string} Sanitized HTML
   */
  sanitizeHtml(html) {
    try {
      const template = document.createElement('template');
      template.innerHTML = html;

      this.sanitizeNodeTree(template.content);

      return template.innerHTML;
    } catch (error) {
      return html;
    }
  }

  /**
   * Walk the node tree and remove dangerous elements/attributes
   * @param {Node} root - Root node to sanitize
   */
  sanitizeNodeTree(root) {
    const blockedTags = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'AUDIO', 'VIDEO']);
    const stack = [];

    Array.from(root.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        stack.push(child);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
      }
    });

    while (stack.length > 0) {
      const node = stack.pop();

      if (blockedTags.has(node.tagName)) {
        node.remove();
        continue;
      }

      // Remove event handler attributes
      const attributes = Array.from(node.attributes || []);
      for (const attr of attributes) {
        if (attr.name.startsWith('on') || attr.name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:')) {
          node.removeAttribute(attr.name);
        }
      }

      // Process children
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          stack.push(child);
        } else if (child.nodeType === Node.COMMENT_NODE) {
          child.remove();
        }
      });
    }
  }
}
