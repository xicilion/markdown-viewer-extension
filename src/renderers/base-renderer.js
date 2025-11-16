/**
 * Base Renderer for diagrams and charts
 * 
 * Each renderer handles one diagram type (mermaid, vega, html, svg, etc.)
 */
export class BaseRenderer {
  /**
   * @param {string} type - Render type identifier (e.g., 'mermaid', 'vega')
   */
  constructor(type) {
    this.type = type;
    this._initialized = false;
  }

  /**
   * Get the render container element
   * All renderers share the same container since rendering is serialized
   * @returns {HTMLElement} Render container element
   */
  getContainer() {
    const container = document.getElementById('render-container');
    if (!container) {
      throw new Error('Render container not found');
    }
    return container;
  }

  /**
   * Initialize renderer (load dependencies, setup environment)
   * Called once before first render
   * Subclasses can override to perform async initialization
   * @param {object} themeConfig - Theme configuration
   * @returns {Promise<void>}
   */
  async initialize(themeConfig = null) {
    this._initialized = true;
  }

  /**
   * Check if renderer is initialized
   * @returns {boolean} True if initialized
   */
  isInitialized() {
    return this._initialized;
  }

  /**
   * Main render method - must be implemented by subclasses
   * @param {string|object} input - Input data for rendering
   * @param {object} themeConfig - Theme configuration
   * @param {object} extraParams - Additional type-specific parameters
   * @returns {Promise<{base64: string, width: number, height: number}>}
   */
  async render(input, themeConfig, extraParams = {}) {
    // Ensure renderer is initialized
    if (!this._initialized) {
      await this.initialize(themeConfig);
    }
    
    // Validate input
    this.validateInput(input);
    
    // Preprocess input if needed
    const processedInput = this.preprocessInput(input, extraParams);
    
    // Render to SVG
    const svg = await this.renderToSvg(processedInput, themeConfig, extraParams);
    
    // Postprocess SVG if needed
    const finalSvg = this.postprocessSvg(svg, themeConfig);
    
    // Convert SVG to PNG
    const scale = this.calculateScale(themeConfig, extraParams);
    return await this.svgToPng(finalSvg, scale);
  }

  /**
   * Validate input data
   * @param {any} input - Input to validate
   * @throws {Error} If input is invalid
   */
  validateInput(input) {
    if (!input || (typeof input === 'string' && input.trim() === '')) {
      throw new Error(`Empty ${this.type} input provided`);
    }
  }

  /**
   * Preprocess input before rendering (can be overridden)
   * @param {any} input - Raw input
   * @param {object} extraParams - Extra parameters
   * @returns {any} Processed input
   */
  preprocessInput(input, extraParams) {
    return input;
  }

  /**
   * Render input to SVG string - must be implemented by subclasses
   * @param {any} input - Processed input
   * @param {object} themeConfig - Theme configuration
   * @param {object} extraParams - Extra parameters
   * @returns {Promise<string>} SVG string
   */
  async renderToSvg(input, themeConfig, extraParams) {
    throw new Error('renderToSvg() must be implemented by subclass');
  }

  /**
   * Postprocess SVG before conversion to PNG (can be overridden)
   * @param {string} svg - Raw SVG string
   * @param {object} themeConfig - Theme configuration
   * @returns {string} Processed SVG string
   */
  postprocessSvg(svg, themeConfig) {
    return svg;
  }

  /**
   * Calculate rendering scale (can be overridden)
   * @param {object} themeConfig - Theme configuration
   * @param {object} extraParams - Extra parameters
   * @returns {number} Scale factor
   */
  calculateScale(themeConfig, extraParams) {
    // Base scale is 2.0, can be adjusted based on font size
    const baseFontSize = 12;
    const themeFontSize = themeConfig?.fontSize || baseFontSize;
    return 2.0 * (themeFontSize / baseFontSize);
  }

  /**
   * Convert SVG to PNG base64
   * @param {string} svg - SVG string
   * @param {number} scale - Scale factor
   * @returns {Promise<{base64: string, width: number, height: number}>}
   */
  async svgToPng(svg, scale = 2.0) {
    const container = this.getContainer();
    container.innerHTML = svg;

    const svgEl = container.querySelector('svg');
    if (!svgEl) {
      throw new Error('No SVG element found in rendered output');
    }

    // Critical: Wait for layout completion with multiple reflows
    container.offsetHeight;
    svgEl.getBoundingClientRect();
    await new Promise(resolve => setTimeout(resolve, 100));

    // Wait for fonts to load if needed
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // Force another reflow after font loading
    container.offsetHeight;
    svgEl.getBoundingClientRect();
    await new Promise(resolve => setTimeout(resolve, 50));

    // Get SVG dimensions from viewBox or attributes
    const viewBox = svgEl.getAttribute('viewBox');
    let width, height;

    if (viewBox) {
      const parts = viewBox.split(/\s+/);
      width = Math.ceil(parseFloat(parts[2]) * scale);
      height = Math.ceil(parseFloat(parts[3]) * scale);
    } else {
      width = Math.ceil((parseFloat(svgEl.getAttribute('width')) || 800) * scale);
      height = Math.ceil((parseFloat(svgEl.getAttribute('height')) || 600) * scale);
    }

    // Create canvas with fixed scale of 4 for high quality
    const canvas = document.getElementById('png-canvas');
    const canvasScale = 4;
    canvas.width = width * canvasScale;
    canvas.height = height * canvasScale;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);

    // Convert SVG to image
    const svgString = new XMLSerializer().serializeToString(svgEl);
    
    // Use data URL for small SVGs, blob URL for large ones
    let imgSrc;
    if (svgString.length > 500000) { // 500KB threshold
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      imgSrc = URL.createObjectURL(svgBlob);
    } else {
      imgSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
    }

    const img = new Image();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (imgSrc.startsWith('blob:')) {
          URL.revokeObjectURL(imgSrc);
        }
        reject(new Error('Image loading timeout'));
      }, 10000); // 10 second timeout

      img.onload = () => {
        clearTimeout(timeout);
        
        // Cleanup blob URL if used
        if (imgSrc.startsWith('blob:')) {
          URL.revokeObjectURL(imgSrc);
        }

        // Validate image dimensions
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          container.innerHTML = '';
          reject(new Error('Invalid image dimensions: ' + img.naturalWidth + 'x' + img.naturalHeight));
          return;
        }

        // Draw image
        ctx.drawImage(img, 0, 0, width, height);

        const pngDataUrl = canvas.toDataURL('image/png', 1.0);
        const base64Data = pngDataUrl.replace(/^data:image\/png;base64,/, '');

        // Clear canvas and container
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        container.innerHTML = '';

        resolve({
          base64: base64Data,
          width: canvas.width,
          height: canvas.height
        });
      };

      img.onerror = (error) => {
        clearTimeout(timeout);
        if (imgSrc.startsWith('blob:')) {
          URL.revokeObjectURL(imgSrc);
        }
        container.innerHTML = '';
        reject(new Error(`Failed to load SVG image: ${error}`));
      };

      img.src = imgSrc;
    });
  }
}
