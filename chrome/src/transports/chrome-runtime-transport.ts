/**
 * BrowserRuntimeTransport
 *
 * Raw transport for browser extension runtime messaging.
 * Supports both Chrome (chrome.*) and Firefox (browser.*) APIs.
 */

import type { MessageTransport, TransportMeta, Unsubscribe } from '../../../src/messaging/transports/transport';

// Use browser API if available (Firefox), otherwise use chrome API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runtime = typeof (globalThis as any).browser !== 'undefined' ? (globalThis as any).browser : chrome;

export interface BrowserRuntimeTransportOptions {
  /**
   * If true, the onMessage listener will return true to indicate it will
   * send an async response via sendResponse(). Required for background scripts
   * that need to respond to requests.
   * 
   * If false (default), the listener returns false, meaning it only receives
   * messages and won't send responses. This prevents Firefox's
   * "Promised response went out of scope" errors in popup/content scripts.
   */
  willRespond?: boolean;
}

export class ChromeRuntimeTransport implements MessageTransport {
  private listener?: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => void | boolean | Promise<unknown>;
  
  private willRespond: boolean;

  constructor(options: BrowserRuntimeTransportOptions = {}) {
    this.willRespond = options.willRespond ?? false;
  }

  async send(message: unknown): Promise<unknown> {
    // Firefox browser.runtime.sendMessage returns a Promise
    // Chrome also supports Promise in modern versions
    try {
      return await runtime.runtime.sendMessage(message);
    } catch (error) {
      // Fallback for older Chrome callback style
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });
    }
  }

  onMessage(handler: (message: unknown, meta?: TransportMeta) => void): Unsubscribe {
    this.listener = (message, sender, sendResponse) => {
      const meta: TransportMeta = {
        raw: sender,
        respond: sendResponse,
      };
      handler(message, meta);
      // Return willRespond to indicate whether we'll send an async response.
      // Background scripts need true; popup/content scripts need false to
      // prevent Firefox's "Promised response went out of scope" errors.
      return this.willRespond;
    };

    runtime.runtime.onMessage.addListener(this.listener);

    return () => {
      if (this.listener) {
        runtime.runtime.onMessage.removeListener(this.listener);
        this.listener = undefined;
      }
    };
  }
}

// Export alias for Firefox compatibility
export { ChromeRuntimeTransport as BrowserRuntimeTransport };
