/**
 * HTML Plugin
 * 
 * Handles HTML code block processing in content script and DOCX export
 */
import { BasePlugin } from './base-plugin.js';

export class HtmlPlugin extends BasePlugin {
  constructor() {
    super('html');
  }

  /**
   * HTML plugin processes 'html' nodes instead of 'code' nodes
   * @returns {string} Node type to visit
   */
  /**
   * Get AST node selectors for remark visit
   * @returns {string[]} Array with 'html' node type
   */
  get nodeSelector() {
    return ['html'];
  }

  /**
   * Extract content from HTML node
   * @param {object} node - AST node
   * @returns {string|null} Extracted content or null
   */
  extractContent(node) {
    // Only process 'html' type nodes
    if (node.type !== 'html') {
      return null;
    }

    const htmlContent = node.value?.trim() || '';
    if (!htmlContent) {
      return null;
    }

    // Skip simple line breaks
    if (/^(?:<br\s*\/?>(?:\s|&nbsp;)*)+$/i.test(htmlContent)) {
      return null;
    }

    return htmlContent;
  }

}
