/**
 * Firefox Popup Entry Point
 * Initialize Firefox platform before loading shared popup
 */

// Initialize Firefox platform FIRST
import '../webview/index';

// Import and initialize shared popup
import { initializePopup } from '../../../src/ui/popup/popup-core';

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializePopup();
});
