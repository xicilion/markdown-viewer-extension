/**
 * Base Renderer for diagrams and charts
 * 
 * Each renderer handles one diagram type (mermaid, vega, html, svg, etc.)
 * Renderer instances are shared, so container management must be stateless
 */

import type { RendererThemeConfig, RenderResult } from '../types/index';

export class BaseRenderer {
  type: string;
  protected _initialized: boolean = false;

  /**
   * @param type - Render type identifier (e.g., 'mermaid', 'vega')
   */
  constructor(type: string) {
    this.type = type;
  }

  /**
   * Create a new render container element for this render
   * Each render gets its own container to support parallel rendering
   * Caller is responsible for calling removeContainer() after use
   * @returns New render container element
   */
  createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = 'render-container-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    container.style.cssText = 'position: absolute; left: -9999px; top: -9999px;';
    document.body.appendChild(container);
    return container;
  }

  /**
   * Remove a render container from DOM
   * @param container - Container to remove
   */
  removeContainer(container: HTMLElement): void {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }

  /**
   * Initialize renderer (load dependencies, setup environment)
   * Called once before first render
   * Subclasses can override to perform async initialization
   * @param themeConfig - Theme configuration
   */
  async initialize(themeConfig: RendererThemeConfig | null = null): Promise<void> {
    this._initialized = true;
  }

  /**
   * Check if renderer is initialized
   * @returns True if initialized
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Main render method - must be implemented by subclasses
   * @param input - Input data for rendering
   * @param themeConfig - Theme configuration
   * @returns Render result with base64, dimensions, and format, or null if nothing to render
   */
  async render(input: string | object, themeConfig: RendererThemeConfig | null): Promise<RenderResult | null> {
    throw new Error('render() must be implemented by subclass');
  }

  /**
   * Validate input data
   * @param input - Input to validate
   * @throws If input is invalid
   */
  validateInput(input: unknown): void {
    if (!input || (typeof input === 'string' && input.trim() === '')) {
      throw new Error(`Empty ${this.type} input provided`);
    }
  }

  /**
   * Preprocess input before rendering (can be overridden)
   * @param input - Raw input
   * @returns Processed input
   */
  preprocessInput(input: unknown): unknown {
    return input;
  }

  /**
   * Calculate scale for canvas rendering
   * This is used by renderers that render to canvas
   * PNG size will be divided by 4 in DOCX, so we multiply by 4 here
   * Formula: (14/16) * (themeFontSize/12) * 4
   * @param themeConfig - Theme configuration
   * @returns Scale factor for canvas
   */
  calculateCanvasScale(themeConfig: RendererThemeConfig | null): number {
    const baseFontSize = 12;
    const themeFontSize = themeConfig?.fontSize || baseFontSize;
    return (14.0 / 16.0) * (themeFontSize / baseFontSize) * 4.0;
  }

  /**
   * Render SVG directly to canvas
   * @param svgContent - SVG content string
   * @param width - Canvas width
   * @param height - Canvas height
   * @param fontFamily - Optional font family to set on canvas
   * @returns Canvas element
   */
  async renderSvgToCanvas(svgContent: string, width: number, height: number, fontFamily: string | null = null): Promise<HTMLCanvasElement> {

    svgContent = svgContent.replace(/<style>/, `<style>foreignObject { overflow: visible; }`);
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';

      // Convert SVG to base64
      const base64Svg = btoa(unescape(encodeURIComponent(svgContent)));
      img.src = `data:image/svg+xml;base64,${base64Svg}`;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        
        // Set font on canvas context if provided
        if (fontFamily) {
          ctx.font = `14px ${fontFamily}`;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas);
      };

      img.onerror = (e) => {
        reject(new Error('Failed to load SVG into image for rendering'));
      };
    });
  }
}
