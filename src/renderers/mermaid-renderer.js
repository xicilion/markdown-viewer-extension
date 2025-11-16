/**
 * Mermaid Renderer
 * 
 * Renders Mermaid diagrams to PNG images
 */
import { BaseRenderer } from './base-renderer.js';
import mermaid from 'mermaid';

export class MermaidRenderer extends BaseRenderer {
  constructor() {
    super('mermaid');
  }

  /**
   * Initialize Mermaid with theme configuration
   * @param {object} themeConfig - Theme configuration
   * @returns {Promise<void>}
   */
  async initialize(themeConfig = null) {
    // Use theme font or fallback to default
    const fontFamily = themeConfig?.fontFamily || "'SimSun', 'Times New Roman', Times, serif";
    
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      lineHeight: 1.6,
      themeVariables: {
        fontFamily: fontFamily,
        background: 'transparent'
      },
      flowchart: {
        htmlLabels: true,
        curve: 'basis'
      }
    });

    this._initialized = true;
  }

  /**
   * Render Mermaid code to SVG
   * @param {string} code - Mermaid diagram code
   * @param {object} themeConfig - Theme configuration
   * @returns {Promise<string>} SVG string
   */
  async renderToSvg(code, themeConfig) {
    const { svg } = await mermaid.render('mermaid-diagram-' + Date.now(), code);

    // Validate SVG content
    if (!svg || svg.length < 100) {
      throw new Error('Generated SVG is too small or empty');
    }

    if (!svg.includes('<svg') || !svg.includes('</svg>')) {
      throw new Error('Generated content is not valid SVG');
    }

    return svg;
  }

  /**
   * Postprocess SVG to prevent text clipping
   * @param {string} svg - Raw SVG string
   * @returns {string} Processed SVG string
   */
  postprocessSvg(svg, themeConfig) {
    return this.preventTextClipping(svg);
  }

  /**
   * Calculate scale based on theme font size
   * Mermaid uses a different font size calculation
   * @param {object} themeConfig - Theme configuration
   * @returns {number} Scale factor
   */
  calculateScale(themeConfig) {
    // Calculate scale based on theme font size
    // Default: 12pt body → 10pt mermaid (10/12 ratio)
    // Mermaid default is 16pt, so we need: (themeFontSize * 10/12) / 16
    const baseFontSize = 12; // pt - base body font size
    const themeFontSize = themeConfig?.fontSize || baseFontSize;
    const mermaidFontSize = themeFontSize * 10 / 12; // mermaid is 10/12 of body
    const mermaidDefaultSize = 16; // pt - mermaid's default font size
    return mermaidFontSize / mermaidDefaultSize;
  }

  /**
   * Prevent text clipping in SVG by adding padding
   * @param {string} svgString - Original SVG string
   * @returns {string} Modified SVG string
   */
  preventTextClipping(svgString) {
    try {
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
      const svgElement = svgDoc.querySelector('svg');

      if (!svgElement) {
        return svgString;
      }

      // Get current viewBox or create from width/height
      let viewBox = svgElement.getAttribute('viewBox');
      if (!viewBox) {
        const width = parseFloat(svgElement.getAttribute('width') || 0);
        const height = parseFloat(svgElement.getAttribute('height') || 0);
        viewBox = `0 0 ${width} ${height}`;
      }

      // Parse viewBox values
      const [x, y, width, height] = viewBox.split(' ').map(parseFloat);

      // Add 5% padding on all sides
      const paddingPercent = 0.05;
      const paddingX = width * paddingPercent;
      const paddingY = height * paddingPercent;

      const newViewBox = `${x - paddingX} ${y - paddingY} ${width + 2 * paddingX} ${height + 2 * paddingY}`;
      svgElement.setAttribute('viewBox', newViewBox);

      // Serialize back to string
      const serializer = new XMLSerializer();
      return serializer.serializeToString(svgDoc);
    } catch (error) {
      // If processing fails, return original
      return svgString;
    }
  }
}
