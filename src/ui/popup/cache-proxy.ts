/**
 * Background cache proxy for popup
 * Communicates with content scripts through background script
 */

import { translate } from './i18n-helpers';
import { toSimpleCacheStats } from '../../utils/cache-stats';
import type { SimpleCacheStats } from '../../types/cache';

/**
 * Clear cache result
 */
interface ClearResult {
  success: boolean;
  error?: string;
}

/**
 * Proxy class for cache operations via background script
 * Note: Popup cannot access IndexedDB directly due to security restrictions
 */
export class BackgroundCacheProxy {
  private maxItems: number | null;

  private requestCounter = 0;

  constructor() {
    // Don't hardcode maxItems, get it from actual stats
    this.maxItems = null;
  }

  private createRequestId(): string {
    this.requestCounter += 1;
    return `${Date.now()}-${this.requestCounter}`;
  }

  private isResponseEnvelopeLike(value: unknown): value is {
    ok?: unknown;
    data?: unknown;
    error?: { message?: unknown };
  } {
    return !!value && typeof value === 'object' && 'ok' in value;
  }

  private async sendCacheOperation(payload: Record<string, unknown>): Promise<unknown> {
    const request = {
      id: this.createRequestId(),
      type: 'CACHE_OPERATION',
      payload,
      timestamp: Date.now(),
      source: 'popup-cache-proxy',
    };

    const platform = (globalThis as unknown as { platform?: { message?: { send?: (req: unknown) => Promise<unknown> } } }).platform;
    if (!platform?.message?.send) {
      throw new Error('Platform messaging not available');
    }

    const response = (await platform.message.send(request)) as unknown;

    if (!response || typeof response !== 'object') {
      throw new Error('No response received from background script');
    }

    if (this.isResponseEnvelopeLike(response)) {
      if (response.ok === true) {
        return response.data;
      }

      const errorMessage = response.error?.message;
      throw new Error(typeof errorMessage === 'string' ? errorMessage : 'Unknown cache error');
    }

    throw new Error('Unexpected response shape (expected ResponseEnvelope)');
  }

  /**
   * Get cache statistics from background script
   * @returns Cache stats object
   */
  async getStats(): Promise<SimpleCacheStats> {
    try {
      const stats = await this.sendCacheOperation({
        operation: 'getStats',
        limit: 50,
      });

      if (!stats) {
        return {
          itemCount: 0,
          maxItems: 1000,
          totalSize: 0,
          totalSizeMB: '0.00',
          items: []
        };
      }

      const normalized = toSimpleCacheStats(stats, this.maxItems || 1000);
      this.maxItems = normalized.maxItems;
      return normalized;
    } catch (error) {
      console.error('Failed to get cache stats via background:', error);
      return {
        itemCount: 0,
        maxItems: this.maxItems || 1000,
        totalSize: 0,
        totalSizeMB: '0.00',
        items: [],
        message: translate('cache_error_message')
      };
    }
  }

  /**
   * Clear all cache via background script
   * @returns Clear result
   */
  async clear(): Promise<ClearResult> {
    try {
      await this.sendCacheOperation({
        operation: 'clear',
      });
      return { success: true };
    } catch (error) {
      console.error('Failed to clear cache via background:', error);
      throw error;
    }
  }
}
