// Render Worker Bootstrap
// Wires a message channel to shared render-worker-core handlers.

import {
  handleRender,
  initRenderEnvironment,
  setThemeConfig,
  type RenderRequest,
} from '../render-worker-core';

import {
  RenderWorkerMessageTypes,
  type RenderDiagramPayload,
  type SetThemeConfigPayload,
  type PingResponse,
} from './protocol';

import {
  initServices,
  type RenderWorkerServices,
} from './services';

export type RenderWorkerChannel = {
  handle: (
    type: string,
    handler: (payload: unknown, meta?: unknown) => unknown
  ) => () => void;
  
  /**
   * Optional: Send request to host (for proxy services)
   * Only needed when using ProxyFetchService
   */
  send?: <T>(type: string, payload: unknown) => Promise<T>;
};

export type BootstrapOptions = {
  canvas?: HTMLCanvasElement | null;

  /**
   * Optional lazy canvas getter, useful when the worker script runs before DOMContentLoaded.
   */
  getCanvas?: () => HTMLCanvasElement | null;

  /**
   * Optional ready getter for PING.
   * Defaults to an internal flag that becomes true after init().
   */
  getReady?: () => boolean;
  
  /**
   * Services to inject into the render worker.
   * If not provided, default services will be used based on environment.
   */
  services?: RenderWorkerServices;
};

export type BootstrapResult = {
  init: () => void;
  setReady: (ready: boolean) => void;
  getReady: () => boolean;
};

export function bootstrapRenderWorker(channel: RenderWorkerChannel, options: BootstrapOptions = {}): BootstrapResult {
  let internalReady = false;

  const getReady = options.getReady ?? (() => internalReady);

  // Initialize services immediately if provided (before any render requests)
  // This is critical - services must be available when render handlers are invoked
  if (options.services) {
    initServices(options.services);
  }

  // Register handlers (pure logic; runtime init happens in init()).
  channel.handle(RenderWorkerMessageTypes.SET_THEME_CONFIG, (payload) => {
    const data = payload as SetThemeConfigPayload | null;
    if (data?.config) {
      setThemeConfig(data.config);
    }
    return {};
  });

  channel.handle(RenderWorkerMessageTypes.RENDER_DIAGRAM, async (payload) => {
    const data = payload as RenderDiagramPayload;

    const request: RenderRequest = {
      renderType: data.renderType || '',
      input: data.input || '',
      themeConfig: data.themeConfig,
    };

    const result = await handleRender(request);
    return result;
  });

  channel.handle(RenderWorkerMessageTypes.PING, (): PingResponse => {
    return { ready: getReady() };
  });

  const init = (): void => {
    const canvas = options.getCanvas ? options.getCanvas() : (options.canvas ?? null);
    initRenderEnvironment({ canvas: canvas || undefined });
    internalReady = true;
  };

  const setReady = (ready: boolean): void => {
    internalReady = ready;
  };

  return { init, setReady, getReady: () => getReady() };
}
