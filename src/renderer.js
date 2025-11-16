// Chrome Extension Renderer Manager using Offscreen API
import ExtensionCacheManager from './cache-manager.js';

class ExtensionRenderer {
  constructor(cacheManager = null) {
    // Use provided cache manager or create a new one
    this.cache = cacheManager || new ExtensionCacheManager();
    this.offscreenCreated = false;
    this.initPromise = null;
    this.themeConfig = null; // Store current theme config for cache key generation
  }

  /**
   * Initialize the renderer
   */
  async init() {
    try {
      // Ensure cache is properly initialized
      if (this.cache) {
        await this.cache.ensureDB();
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Set theme configuration for rendering
   * @param {Object} themeConfig - Theme configuration object
   * @param {string} themeConfig.fontFamily - Font family for text rendering
   * @param {number} themeConfig.fontSize - Font size in pt for scaling calculations
   */
  async setThemeConfig(themeConfig) {
    // Store theme config for cache key generation
    this.themeConfig = themeConfig;
    
    try {
      await this._sendMessage({
        type: 'setThemeConfig',
        config: themeConfig
      });
    } catch (error) {
      console.error('Failed to set theme config:', error);
    }
  }

  /**
   * Send message to offscreen document via background script
   */
  async _sendMessage(message) {
    try {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Message timeout after 5 minutes'));
        }, 300000);

        chrome.runtime.sendMessage(message, (response) => {
          clearTimeout(timeout);

          if (chrome.runtime.lastError) {
            reject(new Error(`Runtime error: ${chrome.runtime.lastError.message}`));
            return;
          }

          if (!response) {
            reject(new Error('No response received from background script'));
            return;
          }

          if (response.error) {
            reject(new Error(response.error));
            return;
          }

          resolve(response);
        });
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Render Mermaid diagram to PNG base64
   */
  async renderMermaidToPng(code) {
    const cacheKey = await this.cache.generateKey(code, 'MERMAID_PNG', this.themeConfig);

    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this._sendMessage({
      type: 'renderMermaid',
      mermaid: code
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // Cache the complete response (base64 + dimensions)
    try {
      await this.cache.set(cacheKey, response, 'MERMAID_PNG');
    } catch (error) {
      // Ignore cache errors
    }

    return response;
  }

  /**
   * Render Vega-Lite specification to PNG base64
   */
  async renderVegaLiteToPng(spec) {
    const specString = typeof spec === 'string' ? spec : JSON.stringify(spec);
    const cacheKey = await this.cache.generateKey(specString, 'VEGALITE_PNG', this.themeConfig);

    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this._sendMessage({
      type: 'renderVegaLite',
      spec: specString
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // Cache the complete response (base64 + dimensions)
    try {
      await this.cache.set(cacheKey, response, 'VEGALITE_PNG');
    } catch (error) {
      // Ignore cache errors
    }

    return response;
  }

  /**
   * Render Vega specification to PNG base64
   */
  async renderVegaToPng(spec) {
    const specString = typeof spec === 'string' ? spec : JSON.stringify(spec);
    const cacheKey = await this.cache.generateKey(specString, 'VEGA_PNG', this.themeConfig);

    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this._sendMessage({
      type: 'renderVega',
      spec: specString
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // Cache the complete response (base64 + dimensions)
    try {
      await this.cache.set(cacheKey, response, 'VEGA_PNG');
    } catch (error) {
      // Ignore cache errors
    }

    return response;
  }

  /**
   * Render HTML to PNG base64
   */
  async renderHtmlToPng(html, width = 1200) {
    const contentKey = html + width;
    const cacheKey = await this.cache.generateKey(contentKey, 'HTML_PNG', this.themeConfig);

    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this._sendMessage({
      type: 'renderHtml',
      html: html,
      width: width
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // Cache the complete response (base64 + dimensions)
    try {
      await this.cache.set(cacheKey, response, 'HTML_PNG');
    } catch (error) {
      // Ignore cache errors
    }

    return response;
  }

  /**
   * Render SVG to PNG base64
   */
  async renderSvgToPng(svg) {
    const cacheKey = await this.cache.generateKey(svg, 'SVG_PNG', this.themeConfig);

    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this._sendMessage({
      type: 'renderSvg',
      svg: svg
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // Cache the complete response (base64 + dimensions)
    this.cache.set(cacheKey, response, 'SVG_PNG').then(() => {
    }).catch(error => {
      // Ignore cache errors
    });

    return response;
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear cache
   */
  async clearCache() {
    await this.cache.clear();
  }

  /**
   * Cleanup offscreen document
   */
  async cleanup() {
    try {
      if (this.offscreenCreated) {
        await chrome.offscreen.closeDocument();
        this.offscreenCreated = false;
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

export default ExtensionRenderer;