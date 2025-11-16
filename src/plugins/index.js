/**
 * Plugin Registry
 * 
 * Centralized plugin management system.
 * New plugins can be added here without modifying content.js or docx-exporter.js.
 * 
 * Architecture:
 * - registerRemarkPlugins(): Register all plugins for remark processing (content.js)
 * - getPluginByType(): Get a specific plugin by type (docx-exporter.js)
 * - plugins: Direct access to plugin array (for advanced use)
 */
import { MermaidPlugin } from './mermaid-plugin.js';
import { VegaLitePlugin } from './vegalite-plugin.js';
import { VegaPlugin } from './vega-plugin.js';
import { HtmlPlugin } from './html-plugin.js';
import { SvgPlugin } from './svg-plugin.js';

// Plugin instances array
// Order matters: HTML plugin first to process raw HTML before other plugins generate placeholders
export const plugins = [
  new HtmlPlugin(),
  new MermaidPlugin(),
  new VegaLitePlugin(),
  new VegaPlugin(),
  new SvgPlugin()
];

/**
 * Register all plugins to a remark processor
 * @param {object} processor - Unified/remark processor
 * @param {object} renderer - Renderer instance
 * @param {Function} asyncTask - Async task creator
 * @param {Function} translate - Translation function
 * @param {Function} escapeHtml - HTML escape function
 * @param {Function} visit - unist-util-visit function
 * @returns {object} The processor (for chaining)
 */
export function registerRemarkPlugins(processor, renderer, asyncTask, translate, escapeHtml, visit) {
  for (const plugin of plugins) {
    processor.use(plugin.createRemarkPlugin(renderer, asyncTask, translate, escapeHtml, visit));
  }
  return processor;
}

/**
 * Get a plugin by type
 * @param {string} type - Plugin type (e.g., 'mermaid', 'svg', 'html')
 * @returns {object|null} Plugin instance or null if not found
 */
export function getPluginByType(type) {
  return plugins.find(p => p.type === type) || null;
}

/**
 * Get a plugin that can handle a specific AST node
 * @param {object} node - AST node (e.g., code block or html node)
 * @returns {object|null} Plugin instance or null if no plugin can handle
 */
export function getPluginForNode(node) {
  for (const plugin of plugins) {
    // Let each plugin decide if it can handle this node
    if (plugin.extractContent(node) !== null) {
      return plugin;
    }
  }
  
  return null;
}

/**
 * Get all plugin types
 * @returns {string[]} Array of plugin types
 */
export function getPluginTypes() {
  return plugins.map(p => p.type);
}