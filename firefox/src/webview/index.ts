/**
 * Firefox Content Script - Platform API Entry Point
 * Re-exports platform API for use in main.ts
 */

import { platform, bridge } from './api-impl';

// Set global platform instance
// This allows other modules (like Localization) to access platform services
globalThis.platform = platform;

// Export for explicit imports
export { platform, bridge };
