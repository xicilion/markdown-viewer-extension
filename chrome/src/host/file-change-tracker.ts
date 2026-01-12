/**
 * File Change Tracker
 *
 * Monitors local file:// URLs for changes and notifies tabs when content changes.
 * Uses polling mechanism to detect file modifications.
 */

import { hashCode } from '../../../src/utils/hash';

/**
 * Tracked file metadata
 */
interface TrackedFile {
  url: string;
  lastHash: string;
  tabId: number;
}

/**
 * Auto refresh settings
 */
export interface AutoRefreshSettings {
  enabled: boolean;
  intervalMs: number;
}

/**
 * Default auto refresh settings
 */
export const DEFAULT_AUTO_REFRESH_SETTINGS: AutoRefreshSettings = {
  enabled: true,
  intervalMs: 1000,
};

/**
 * File Change Tracker class
 *
 * Manages polling of local files and notifies associated tabs when content changes.
 */
export class FileChangeTracker {
  private trackedFiles: Map<string, TrackedFile> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private settings: AutoRefreshSettings = DEFAULT_AUTO_REFRESH_SETTINGS;

  /**
   * Update tracker settings
   */
  updateSettings(settings: AutoRefreshSettings): void {
    this.settings = settings;

    // Restart polling with new interval if active
    if (this.intervalId !== null) {
      this.stopPolling();
      if (this.settings.enabled && this.trackedFiles.size > 0) {
        this.startPolling();
      }
    }
  }

  /**
   * Get current settings
   */
  getSettings(): AutoRefreshSettings {
    return this.settings;
  }

  /**
   * Start tracking a file
   */
  async startTracking(
    fileUrl: string,
    tabId: number,
    readFileFn: (url: string) => Promise<string>
  ): Promise<void> {
    // Only track file:// URLs
    if (!fileUrl.startsWith('file://')) {
      return;
    }

    try {
      // Read initial content and compute hash
      const content = await readFileFn(fileUrl);
      const hash = hashCode(content);

      this.trackedFiles.set(fileUrl, {
        url: fileUrl,
        lastHash: hash,
        tabId,
      });

      // Start polling if not already running and enabled
      if (this.settings.enabled && this.intervalId === null) {
        this.startPolling();
      }
    } catch (error) {
      console.warn(`[FileChangeTracker] Failed to start tracking ${fileUrl}:`, error);
    }
  }

  /**
   * Stop tracking a specific file
   */
  stopTracking(fileUrl: string): void {
    this.trackedFiles.delete(fileUrl);

    // Stop polling if no files are tracked
    if (this.trackedFiles.size === 0) {
      this.stopPolling();
    }
  }

  /**
   * Stop tracking all files for a specific tab
   */
  stopTrackingByTab(tabId: number): void {
    for (const [url, tracked] of this.trackedFiles) {
      if (tracked.tabId === tabId) {
        this.trackedFiles.delete(url);
      }
    }

    // Stop polling if no files are tracked
    if (this.trackedFiles.size === 0) {
      this.stopPolling();
    }
  }

  /**
   * Start the polling loop
   */
  private startPolling(): void {
    if (this.intervalId !== null) {
      return;
    }

    this.intervalId = setInterval(() => {
      void this.checkAllFiles();
    }, this.settings.intervalMs);
  }

  /**
   * Stop the polling loop
   */
  private stopPolling(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check all tracked files for changes
   */
  private async checkAllFiles(): Promise<void> {
    // Skip if disabled
    if (!this.settings.enabled) {
      return;
    }

    for (const [url, tracked] of this.trackedFiles) {
      try {
        await this.checkFileChange(tracked);
      } catch (error) {
        // File might be deleted or inaccessible, stop tracking it
        console.warn(`[FileChangeTracker] Error checking ${url}, removing from tracking:`, error);
        this.trackedFiles.delete(url);
      }
    }

    // Stop polling if all files were removed due to errors
    if (this.trackedFiles.size === 0) {
      this.stopPolling();
    }
  }

  /**
   * Check a single file for changes
   */
  private async checkFileChange(tracked: TrackedFile): Promise<void> {
    // Use fetch to read file (background script has file:// permission)
    const response = await fetch(tracked.url);
    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.status}`);
    }

    const content = await response.text();
    const newHash = hashCode(content);

    if (newHash !== tracked.lastHash) {
      tracked.lastHash = newHash;
      this.notifyChange(tracked.tabId, tracked.url, content);
    }
  }

  /**
   * Notify a tab that its file has changed
   */
  private notifyChange(tabId: number, url: string, content: string): void {
    chrome.tabs.sendMessage(tabId, {
      id: `file-change-${Date.now()}`,
      type: 'FILE_CHANGED',
      payload: {
        url,
        content,
        timestamp: Date.now(),
      },
    }).catch((error) => {
      // Tab might be closed or not ready, stop tracking it
      console.warn(`[FileChangeTracker] Failed to notify tab ${tabId}:`, error);
      this.stopTrackingByTab(tabId);
    });
  }

  /**
   * Get tracking status for debugging
   */
  getStatus(): { trackedCount: number; isPolling: boolean; settings: AutoRefreshSettings } {
    return {
      trackedCount: this.trackedFiles.size,
      isPolling: this.intervalId !== null,
      settings: this.settings,
    };
  }
}

// Singleton instance
let fileChangeTrackerInstance: FileChangeTracker | null = null;

/**
 * Get the singleton FileChangeTracker instance
 */
export function getFileChangeTracker(): FileChangeTracker {
  if (!fileChangeTrackerInstance) {
    fileChangeTrackerInstance = new FileChangeTracker();
  }
  return fileChangeTrackerInstance;
}
