/**
 * HTML Renderer
 * 
 * Renders HTML code blocks to PNG images using html2canvas
 */
import { BaseRenderer } from './base-renderer.js';
import { sanitizeHtml, hasHtmlContent } from '../utils/html-sanitizer.js';

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
    const sanitizedHtml = sanitizeHtml(htmlContent);

    // Check if there's any visible content after sanitization
    if (!hasHtmlContent(sanitizedHtml)) {
      // If only comments or whitespace, return null to skip rendering
      return null;
    }

    const container = this.getContainer();
    const targetWidth = extraParams.width || 1200;
    const normalizedTargetWidth = Number.isFinite(targetWidth) && targetWidth > 0 ? targetWidth : null;

    // Apply theme font-family to HTML container
    const fontFamily = themeConfig?.fontFamily || "'-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica', 'Arial', sans-serif";

    // Force width if provided, otherwise auto
    const widthStyle = normalizedTargetWidth ? `${normalizedTargetWidth}px` : 'auto';

    container.style.cssText = `display: inline-block; position: relative; background: transparent; padding: 0; margin: 0; width: ${widthStyle}; font-family: ${fontFamily};`;

    // Wrap sanitized HTML in markdown-body container for proper styling
    container.innerHTML = `<div class="markdown-body">${sanitizedHtml}</div>`;

    // Give the layout engine a tick in the offscreen document context
    container.offsetHeight;
    await new Promise((resolve) => setTimeout(resolve, 0));

    const rect = container.getBoundingClientRect();
    const widthFallback = normalizedTargetWidth || 1;
    // If we forced a width, use it. Otherwise measure.
    const rawWidth = normalizedTargetWidth || rect.width || container.scrollWidth || container.offsetWidth || widthFallback;
    const measuredWidth = Math.ceil(rawWidth);
    const captureWidth = measuredWidth > 0 ? measuredWidth : widthFallback;

    container.style.width = `${captureWidth}px`;
    container.style.display = 'block';

    // Calculate scale based on target width
    const scale = this.calculateCanvasScale(themeConfig);

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
}
