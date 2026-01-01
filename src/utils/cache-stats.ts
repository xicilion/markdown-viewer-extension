import type { CacheStats, SimpleCacheStats } from '../types/cache';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function isSimpleCacheStats(value: unknown): value is SimpleCacheStats {
  if (!isRecord(value)) return false;
  return (
    typeof value.itemCount === 'number' &&
    typeof value.maxItems === 'number' &&
    typeof value.totalSize === 'number' &&
    typeof value.totalSizeMB === 'string' &&
    Array.isArray(value.items)
  );
}

/**
 * Normalize various cache stats shapes into the flat stats used by the popup UI.
 * Accepts:
 * - SimpleCacheStats (already flat)
 * - ExtensionCacheManager.getStats() (nested CacheStats)
 */
export function toSimpleCacheStats(
  value: unknown,
  fallbackMaxItems: number = 1000
): SimpleCacheStats {
  if (!value) {
    return {
      itemCount: 0,
      maxItems: fallbackMaxItems,
      totalSize: 0,
      totalSizeMB: '0.00',
      items: []
    };
  }

  if (isSimpleCacheStats(value)) {
    return value;
  }

  if (isRecord(value) && isRecord(value.indexedDBCache)) {
    const indexed = value.indexedDBCache as Record<string, unknown>;
    const combined = isRecord(value.combined) ? (value.combined as Record<string, unknown>) : null;

    const totalSize = toNumber(indexed.totalSize, 0);
    const totalSizeMB = toString(
      indexed.totalSizeMB,
      combined ? toString(combined.totalSizeMB, (totalSize / (1024 * 1024)).toFixed(2)) : (totalSize / (1024 * 1024)).toFixed(2)
    );

    return {
      itemCount: toNumber(indexed.itemCount, combined ? toNumber(combined.totalItems, 0) : 0),
      maxItems: toNumber(indexed.maxItems, fallbackMaxItems),
      totalSize,
      totalSizeMB,
      items: toArray(indexed.items),
      message: typeof value.message === 'string' ? value.message : undefined
    };
  }

  // Last-resort: tolerate "SimpleCacheStats-like" objects
  if (isRecord(value)) {
    return {
      itemCount: toNumber(value.itemCount, 0),
      maxItems: toNumber(value.maxItems, fallbackMaxItems),
      totalSize: toNumber(value.totalSize, 0),
      totalSizeMB: toString(value.totalSizeMB, '0.00'),
      items: toArray(value.items),
      message: typeof value.message === 'string' ? value.message : undefined
    };
  }

  return {
    itemCount: 0,
    maxItems: fallbackMaxItems,
    totalSize: 0,
    totalSizeMB: '0.00',
    items: []
  };
}

/**
 * Narrowing helper for ExtensionCacheManager.getStats().
 * Kept here so callers can stay strict without importing deep cache-manager types.
 */
export function isExtensionCacheManagerStats(value: unknown): value is CacheStats {
  return Boolean(value) && typeof value === 'object' && 'indexedDBCache' in (value as Record<string, unknown>);
}
