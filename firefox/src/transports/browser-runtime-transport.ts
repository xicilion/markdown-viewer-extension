/**
 * BrowserRuntimeTransport
 *
 * Raw transport for browser.runtime messaging (Firefox WebExtension API).
 * Similar to ChromeRuntimeTransport but uses browser.* API with Promise support.
 */

import type { MessageTransport, TransportMeta, Unsubscribe } from '../../../src/messaging/transports/transport';

// Firefox WebExtension API types
declare const browser: typeof chrome;

export class BrowserRuntimeTransport implements MessageTransport {
  private listener?: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => void | boolean | Promise<unknown>;

  async send(message: unknown): Promise<unknown> {
    try {
      // Firefox browser.runtime.sendMessage returns a Promise
      return await browser.runtime.sendMessage(message);
    } catch (error) {
      // Handle connection errors gracefully
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`BrowserRuntimeTransport send failed: ${errorMessage}`);
    }
  }

  onMessage(handler: (message: unknown, meta?: TransportMeta) => void): Unsubscribe {
    this.listener = (message, sender, sendResponse) => {
      const meta: TransportMeta = {
        raw: sender,
        respond: sendResponse,
      };
      handler(message, meta);
      // Return true to indicate async response handling
      return true;
    };

    browser.runtime.onMessage.addListener(this.listener);

    return () => {
      if (this.listener) {
        browser.runtime.onMessage.removeListener(this.listener);
        this.listener = undefined;
      }
    };
  }
}
