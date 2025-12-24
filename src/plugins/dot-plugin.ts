/**
 * DOT Plugin
 * 
 * Handles Graphviz DOT diagram processing in content script and DOCX export
 */
import { BasePlugin } from './base-plugin';

export class DotPlugin extends BasePlugin {
  constructor() {
    super('dot');
  }
}
