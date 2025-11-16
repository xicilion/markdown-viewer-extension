/**
 * Mermaid Plugin
 * 
 * Handles Mermaid diagram processing in content script and DOCX export
 */
import { BasePlugin } from './base-plugin.js';

export class MermaidPlugin extends BasePlugin {
  constructor() {
    super('mermaid');
  }
}
