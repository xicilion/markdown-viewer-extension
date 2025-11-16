/**
 * SVG Renderer
 * 
 * Renders SVG code blocks to PNG images
 */
import { BaseRenderer } from './base-renderer.js';

export class SvgRenderer extends BaseRenderer {
  constructor() {
    super('svg');
  }

  /**
   * Validate SVG input
   */
  validateInput(input) {
    if (!input || typeof input !== 'string') {
      throw new Error('SVG input must be a non-empty string');
    }
    if (!input.includes('<svg')) {
      throw new Error('Invalid SVG: missing <svg> tag');
    }
    return true;
  }

  /**
   * SVG is passed directly, no additional rendering needed
   * @param {string} input - SVG content
   * @param {object} themeConfig - Theme configuration
   * @param {object} extraParams - Extra parameters
   * @returns {Promise<string>} SVG string (unchanged)
   */
  async renderToSvg(input, themeConfig, extraParams) {
    return input;
  }

  /**
   * Calculate scale for SVG rendering
   * Default scale is 1.0 for SVG (no scaling needed)
   * @param {object} themeConfig - Theme configuration
   * @param {object} extraParams - Extra parameters
   * @returns {number} Scale factor
   */
  calculateScale(themeConfig, extraParams) {
    // SVG rendering uses a scale of 1.0
    return 1.0;
  }
}
