/**
 * Render Worker Services
 * 
 * Provides service abstractions for render workers that may need
 * to access resources from the host environment.
 * 
 * Services are injected during worker bootstrap and can be:
 * - Direct implementations (Chrome offscreen can fetch directly)
 * - Proxy implementations (VSCode srcdoc must relay through host)
 */

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Fetch service for loading remote resources
 * Used by HtmlRenderer to load remote images before SVG foreignObject rendering
 */
export interface FetchService {
  /**
   * Fetch a remote URL and return as base64 data URL
   * @param url - Remote URL to fetch (http/https)
   * @returns Base64 data URL or null if fetch fails
   */
  fetchAsDataUrl(url: string): Promise<string | null>;
}

/**
 * All services available to render workers
 */
export interface RenderWorkerServices {
  fetch: FetchService;
}

// ============================================================================
// Default Implementations
// ============================================================================

/**
 * Direct fetch service - fetches resources directly via browser fetch API
 * Works in: Chrome offscreen, Mobile iframe (no CSP restrictions)
 */
export class DirectFetchService implements FetchService {
  async fetchAsDataUrl(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'omit',
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        return null;
      }
      
      const blob = await response.blob();
      
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }
}

/**
 * Proxy fetch service - relays fetch requests to host via message channel
 * Works in: VSCode srcdoc iframe (CSP blocks direct fetch)
 */
export class ProxyFetchService implements FetchService {
  private pendingRequests = new Map<string, {
    resolve: (value: string | null) => void;
    reject: (error: Error) => void;
  }>();
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor() {
    // Set up response listener
    this.messageHandler = (event: MessageEvent) => {
      const data = event.data as {
        __serviceResponse?: boolean;
        id?: string;
        ok?: boolean;
        data?: unknown;
        error?: string;
      } | null;
      
      if (!data || !data.__serviceResponse || !data.id) return;
      
      const pending = this.pendingRequests.get(data.id);
      if (!pending) return;
      
      this.pendingRequests.delete(data.id);
      
      if (data.ok) {
        const result = data.data as { dataUrl?: string | null } | null;
        pending.resolve(result?.dataUrl ?? null);
      } else {
        pending.reject(new Error(data.error || 'Unknown error'));
      }
    };
    
    window.addEventListener('message', this.messageHandler);
  }

  async fetchAsDataUrl(url: string): Promise<string | null> {
    const id = `fetch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    return new Promise((resolve, reject) => {
      // Store pending request
      this.pendingRequests.set(id, { resolve, reject });
      
      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve(null);
        }
      }, 15000);
      
      // Send request to parent (host)
      try {
        window.parent.postMessage({
          __serviceRequest: true,
          type: 'FETCH_REMOTE_URL',
          id,
          payload: { url },
        }, '*');
      } catch {
        this.pendingRequests.delete(id);
        resolve(null);
      }
    });
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    this.pendingRequests.clear();
  }
}

// ============================================================================
// Service Registry
// ============================================================================

let services: RenderWorkerServices | null = null;

/**
 * Initialize services for the render worker
 * Call this during worker bootstrap
 */
export function initServices(s: RenderWorkerServices): void {
  services = s;
}

/**
 * Get the fetch service
 * Returns a no-op service if not initialized (graceful degradation)
 */
export function getFetchService(): FetchService {
  if (!services?.fetch) {
    // Return a no-op service that always returns null
    // This allows renderers to work without services, just without remote fetch
    return {
      fetchAsDataUrl: async () => null
    };
  }
  return services.fetch;
}

/**
 * Check if services have been initialized
 */
export function hasServices(): boolean {
  return services !== null;
}
