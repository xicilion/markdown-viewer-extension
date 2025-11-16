// Chrome Extension Renderer Manager using Offscreen API
import { CacheManager } from './cache-manager.js';
import { UploadManager } from './upload-manager.js';

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
   * Unified diagram rendering method
   * @param {string} renderType - Type of diagram (mermaid, vega, etc.)
   * @param {string|object} input - Input data for rendering
   * @param {object} extraParams - Additional parameters
   * @param {string} cacheType - Cache type identifier
   * @returns {Promise<object>} Render result with base64, width, height
   */
  async _renderDiagram(renderType, input, extraParams = {}, cacheType) {
    // Generate cache key
    const inputString = typeof input === 'string' ? input : JSON.stringify(input);
    const contentKey = inputString + JSON.stringify(extraParams);
    const cacheKey = await this.cache.generateKey(contentKey, cacheType, this.themeConfig);

    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Send unified message
    const message = {
      action: 'RENDER_DIAGRAM',
      renderType,
      input,
      themeConfig: this.themeConfig,
      extraParams
    };
    const response = await this._sendMessage(message);

    if (response.error) {
      throw new Error(response.error);
    }

    // Cache the complete response (base64 + dimensions)
    try {
      await this.cache.set(cacheKey, response, cacheType);
    } catch (error) {
      // Ignore cache errors
    }

    return response;
  }

  /**
   * Unified render method
   * @param {string} type - Renderer type (mermaid, vega, vega-lite, html, svg, etc.)
   * @param {string|object} input - Input data for rendering
   * @param {object} extraParams - Additional parameters
   * @returns {Promise<object>} Render result with base64, width, height
   */
  async render(type, input, extraParams = {}) {
    // Generate cache type identifier
    const cacheType = `${type.toUpperCase()}_PNG`;
    
    return this._renderDiagram(type, input, extraParams, cacheType);
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