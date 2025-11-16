/**
 * Renderer Registry
 * 
 * Exports all available renderers as an array.
 * New renderers can be added here without modifying other files.
 */
import { MermaidRenderer } from './mermaid-renderer.js';
import { VegaRenderer } from './vega-renderer.js';
import { HtmlRenderer } from './html-renderer.js';
import { SvgRenderer } from './svg-renderer.js';

// Export renderer instances array
export const renderers = [
  new MermaidRenderer(),
  new VegaRenderer('vega-lite'),
  new VegaRenderer('vega'),
  new HtmlRenderer(),
  new SvgRenderer()
];
