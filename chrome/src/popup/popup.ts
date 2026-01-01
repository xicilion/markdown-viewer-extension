// Markdown Viewer Extension - Chrome Popup Entry Point
// Initialize Chrome platform before loading shared popup

// Initialize Chrome platform FIRST
import '../webview/index';

// Import and initialize shared popup
import { initializePopup } from '../../../src/ui/popup/popup-core';

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializePopup();
});
