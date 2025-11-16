// Offscreen document script for rendering
import { renderers } from './renderers/index.js';

// Create renderer map for quick lookup
const rendererMap = new Map(
  renderers.map(r => [r.type, r])
);

// Add error listeners for debugging
window.addEventListener('error', (event) => {
  chrome.runtime.sendMessage({
    type: 'offscreenError',
    error: event.error?.message || 'Unknown error',
    filename: event.filename,
    lineno: event.lineno
  }).catch(() => { });
});

window.addEventListener('unhandledrejection', (event) => {
  chrome.runtime.sendMessage({
    type: 'offscreenError',
    error: `Unhandled promise rejection: ${event.reason}`,
    filename: 'Promise',
    lineno: 0
  }).catch(() => { });
});

// Optimize canvas performance on page load
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.style.backgroundColor = 'transparent';
  document.body.style.backgroundColor = 'transparent';

  const canvas = document.getElementById('png-canvas');
  if (canvas) {
    // Pre-initialize context with willReadFrequently for better performance
    canvas.getContext('2d', { willReadFrequently: true });
  }

  // Send ready signal when DOM is loaded
  chrome.runtime.sendMessage({
    type: 'offscreenDOMReady'
  }).catch(() => { });
});

// Store current theme configuration
let currentThemeConfig = null;

// Establish connection with background script for lifecycle monitoring
const port = chrome.runtime.connect({ name: 'offscreen' });

// Notify background script that offscreen document is ready
chrome.runtime.sendMessage({
  type: 'offscreenReady'
}).catch(() => {
  // Ignore errors if background script isn't ready
});

// Message handler for rendering requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  if (message.type === 'setThemeConfig') {
    // Update theme configuration
    currentThemeConfig = message.config;
    sendResponse({ success: true });
    return true;
  }
  
  // Handle unified render messages
  if (message.action === 'RENDER_DIAGRAM') {
    // Check message source using Chrome's sender object
    // - sender.tab exists → from content script → SKIP (let background handle)
    // - sender.tab is undefined → from background/extension → PROCESS
    if (sender.tab) {
      return; // Don't send response, let background handle it
    }
    
    handleRender(message).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true;
  }
});

/**
 * Handle unified render messages
 * @param {object} message - Unified message with action, renderType, input, etc.
 * @returns {Promise<object>} Render result
 */
async function handleRender(message) {
  const { renderType, input, themeConfig, extraParams } = message;
  
  // Update theme config if provided
  if (themeConfig && themeConfig !== currentThemeConfig) {
    currentThemeConfig = themeConfig;
  }
  
  // Use new renderer architecture
  const renderer = rendererMap.get(renderType);
  
  if (!renderer) {
    throw new Error(`No renderer found for type: ${renderType}`);
  }
  
  return await renderer.render(input, themeConfig, extraParams);
}

// Signal that the offscreen document is ready
chrome.runtime.sendMessage({ type: 'offscreenReady' }).then(() => {
}).catch(error => {
});