// Vega-Lite Plugin using BasePlugin architecture
import { BasePlugin } from './base-plugin.js';

/**
 * Vega-Lite Plugin implementation
 */
export class VegaLitePlugin extends BasePlugin {
  constructor() {
    super('vega-lite');
  }
  
  /**
   * Override extractContent to support both 'vega-lite' and 'vegalite'
   */
  extractContent(node) {
    // Support both 'vega-lite' and 'vegalite' language identifiers
    if (node.type === 'code' && (node.lang === 'vega-lite' || node.lang === 'vegalite')) {
      return node.value || null;
    }
    return null;
  }
}
