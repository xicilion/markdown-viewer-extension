/**
 * DOT Renderer
 * 
 * Renders Graphviz DOT diagrams to PNG images
 */
import { BaseRenderer } from './base-renderer';
import { instance } from '@viz-js/viz';
import type { RendererThemeConfig, RenderResult } from '../types/index';

export class DotRenderer extends BaseRenderer {
  private viz: Awaited<ReturnType<typeof instance>> | null = null;

  constructor() {
    super('dot');
  }

  /**
   * Initialize Viz.js instance
   * @param themeConfig - Theme configuration
   */
  async initialize(themeConfig: RendererThemeConfig | null = null): Promise<void> {
    this.viz = await instance();
    this._initialized = true;
  }

  /**
   * Render DOT diagram to PNG
   * @param code - DOT diagram code
   * @param themeConfig - Theme configuration
   * @returns Render result with base64, width, height, format
   */
  async render(code: string, themeConfig: RendererThemeConfig | null): Promise<RenderResult> {
    // Ensure renderer is initialized
    if (!this._initialized || !this.viz) {
      await this.initialize(themeConfig);
    }

    // Validate input
    this.validateInput(code);

    // Debug: log the code being rendered
    console.log('[DOT] Rendering code:', code);

    // Render DOT to SVG with transparent background
    const svg = this.viz!.renderSVGElement(code, {
      graphAttributes: {
        bgcolor: 'transparent'
      }
    });

    // Get SVG dimensions from viewBox or attributes
    const viewBox = svg.getAttribute('viewBox');
    let captureWidth: number, captureHeight: number;

    if (viewBox) {
      const parts = viewBox.split(/\s+/);
      captureWidth = Math.ceil(parseFloat(parts[2]));
      captureHeight = Math.ceil(parseFloat(parts[3]));
    } else {
      captureWidth = Math.ceil(parseFloat(svg.getAttribute('width') || '800'));
      captureHeight = Math.ceil(parseFloat(svg.getAttribute('height') || '600'));
    }

    // Get SVG as string
    const svgString = new XMLSerializer().serializeToString(svg);

    // Calculate scale for PNG dimensions
    const scale = this.calculateCanvasScale(themeConfig);

    // Render SVG to canvas as PNG
    const canvas = await this.renderSvgToCanvas(svgString, captureWidth * scale, captureHeight * scale);

    const pngDataUrl = canvas.toDataURL('image/png', 1.0);
    const base64Data = pngDataUrl.replace(/^data:image\/png;base64,/, '');

    return {
      base64: base64Data,
      width: canvas.width,
      height: canvas.height,
      format: 'png'
    };
  }
}
