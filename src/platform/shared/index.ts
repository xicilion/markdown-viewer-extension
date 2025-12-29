/**
 * Platform Shared Module
 * 
 * Exports common base classes and utilities shared across all platforms.
 */

export {
  BaseI18nService,
  DEFAULT_SETTING_LOCALE,
  FALLBACK_LOCALE
} from './base-services';

export type {
  LocaleMessages,
  LocaleMessageEntry
} from './base-services';

// Re-export types from unified type system
export type {
  RendererThemeConfig,
  RenderResult,
  CacheStats,
  SimpleCacheStats
} from '../../types/index';

// Re-export QueueContext from unified renderer service
export type { QueueContext } from '../../services/renderer-service';

// Note: Render worker related code locations:
// - Chrome: src/platform/chrome/offscreen-render-worker.ts
// - Mobile: src/platform/mobile/iframe-render-worker.ts
// - Shared bootstrap: src/renderers/worker/worker-bootstrap.ts

