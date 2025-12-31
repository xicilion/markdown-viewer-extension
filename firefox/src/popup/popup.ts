/**
 * Firefox Popup Entry Point
 * Initialize Firefox platform before loading popup
 */

// Initialize Firefox platform
import '../webview/index';

// Re-export Chrome popup (it uses chrome.* API which Firefox supports)
import '../../../chrome/src/popup/popup';
