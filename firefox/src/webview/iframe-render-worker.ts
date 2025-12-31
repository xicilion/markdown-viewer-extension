// Firefox Iframe Render Worker
// Entry point for the render iframe in Firefox content script
// Based on mobile/src/iframe-render-worker.ts

console.log('[Firefox IframeWorker] Script started');

// Send ready message immediately before any imports fail
try {
  console.log('[Firefox IframeWorker] Sending early RENDER_FRAME_READY to parent');
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'RENDER_FRAME_READY' }, '*');
    console.log('[Firefox IframeWorker] Early RENDER_FRAME_READY sent');
  } else {
    console.log('[Firefox IframeWorker] window.parent not available or same as window');
  }
} catch (e) {
  console.error('[Firefox IframeWorker] Error sending early ready:', e);
}

import { RenderChannel } from '../../../src/messaging/channels/render-channel';
import { WindowPostMessageTransport } from '../../../src/messaging/transports/window-postmessage-transport';

import { bootstrapRenderWorker } from '../../../src/renderers/worker/worker-bootstrap';
import { MessageTypes } from '../../../src/renderers/render-worker-core';

type ReadyAckMessage = {
  type?: string;
};

function initialize(): void {
  console.log('[Firefox IframeWorker] initialize() called');
  let isReady = false;
  let readyAcknowledged = false;
  let readyInterval: ReturnType<typeof setInterval> | null = null;

  console.log('[Firefox IframeWorker] Creating RenderChannel');
  const renderChannel = new RenderChannel(
    new WindowPostMessageTransport(window.parent, {
      targetOrigin: '*',
      acceptSource: window.parent,
    }),
    {
      source: 'firefox-iframe-render',
      timeoutMs: 60_000,
    }
  );

  const worker = bootstrapRenderWorker(renderChannel, {
    getCanvas: () => document.getElementById('png-canvas') as HTMLCanvasElement | null,
    getReady: () => isReady,
  });

  window.addEventListener('message', (event: MessageEvent<ReadyAckMessage>) => {
    const message = event.data;
    console.log('[Firefox IframeWorker] Received message:', message?.type);
    if (message && (message.type === MessageTypes.READY_ACK || message.type === 'READY_ACK')) {
      console.log('[Firefox IframeWorker] READY_ACK received!');
      readyAcknowledged = true;
      if (readyInterval) {
        clearInterval(readyInterval);
        readyInterval = null;
      }
    }
  });

  const sendReady = (): void => {
    if (readyAcknowledged) {
      console.log('[Firefox IframeWorker] sendReady skipped - already acknowledged');
      return;
    }

    try {
      if (window.parent && window.parent !== window) {
        console.log('[Firefox IframeWorker] Sending RENDER_FRAME_READY');
        window.parent.postMessage({ type: 'RENDER_FRAME_READY' }, '*');
      }
    } catch (e) {
      console.error('[Firefox IframeWorker] Error in sendReady:', e);
    }
  };

  console.log('[Firefox IframeWorker] Calling worker.init()');
  worker.init();
  isReady = true;
  console.log('[Firefox IframeWorker] Worker initialized, isReady=true');

  sendReady();
  readyInterval = setInterval(sendReady, 100);
  console.log('[Firefox IframeWorker] Started sendReady interval');

  // Stop sending ready after 10 seconds
  setTimeout(() => {
    if (readyInterval) {
      clearInterval(readyInterval);
      readyInterval = null;
    }
  }, 10_000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
