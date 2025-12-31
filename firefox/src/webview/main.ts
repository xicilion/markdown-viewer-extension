// Markdown Viewer Main - Firefox Extension Entry Point
// Focuses on Firefox UI layout; markdown rendering orchestration is shared.
// Uses iframe-based rendering (similar to mobile) instead of Offscreen API.

import DocxExporter from '../../../src/exporters/docx-exporter';
import Localization, { DEFAULT_SETTING_LOCALE } from '../../../src/utils/localization';
import themeManager from '../../../src/utils/theme-manager';
import { loadAndApplyTheme } from '../../../src/utils/theme-to-css';
import { platform } from './index';
import { wrapFileContent } from '../../../src/utils/file-wrapper';

import type { PluginRenderer, RendererThemeConfig } from '../../../src/types/index';

import { renderMarkdownDocument } from '../../../src/core/viewer/viewer-controller';
import { escapeHtml } from '../../../src/core/markdown-processor';

// Firefox-specific modules (reuse Chrome modules where possible)
import { BackgroundCacheManagerProxy } from '../../../src/core/cache-proxy';
import { createScrollManager } from '../../../src/core/scroll-manager';
import { createFileStateManager, getCurrentDocumentUrl, saveToHistory } from '../../../src/core/file-state';
import { updateProgress, showProcessingIndicator, hideProcessingIndicator } from '../../../chrome/src/webview/ui/progress-indicator';
import { createTocManager } from '../../../chrome/src/webview/ui/toc-manager';
import { createToolbarManager, generateToolbarHTML, layoutIcons } from '../../../chrome/src/webview/ui/toolbar';

// Extend Window interface for global access
declare global {
  interface Window {
    docxExporter: DocxExporter;
  }
}

/**
 * Layout configuration
 */
interface LayoutConfig {
  maxWidth: string;
  icon: string;
  title: string;
}

/**
 * Layout titles interface
 */
interface LayoutTitles {
  normal: string;
  fullscreen: string;
  narrow: string;
}

/**
 * Layout configurations map
 */
interface LayoutConfigs {
  normal: LayoutConfig;
  fullscreen: LayoutConfig;
  narrow: LayoutConfig;
}

async function initializeMain(): Promise<void> {
  console.log('[Firefox Main] initializeMain started');
  const translate = (key: string, substitutions?: string | string[]): string =>
    Localization.translate(key, substitutions);

  // Initialize cache manager with platform
  console.log('[Firefox Main] Creating cache manager');
  const cacheManager = new BackgroundCacheManagerProxy(platform);

  // Use platform.renderer for iframe-based rendering (same as mobile)
  console.log('[Firefox Main] Creating pluginRenderer');
  const pluginRenderer: PluginRenderer = {
    render: async (type, content, _context) => {
      console.log('[Firefox Main] pluginRenderer.render called:', type, 'content length:', content?.length);
      const result = await platform.renderer.render(type, content);

      if (result && (result as { error?: string }).error) {
        throw new Error((result as { error?: string }).error || 'Render failed');
      }

      if (typeof result.width !== 'number' || typeof result.height !== 'number') {
        throw new Error('Render result missing dimensions');
      }

      const format = typeof result.format === 'string' && result.format.length > 0 ? result.format : 'png';

      return {
        base64: result.base64,
        width: result.width,
        height: result.height,
        format,
        error: result.error,
      };
    },
  };

  // Initialize DOCX exporter
  console.log('[Firefox Main] Creating DocxExporter');
  const docxExporter = new DocxExporter(pluginRenderer);

  // Store exporter for plugins and debugging
  window.docxExporter = docxExporter;

  // Initialize file state manager
  console.log('[Firefox Main] Creating file state manager');
  const { saveFileState, getFileState } = createFileStateManager(platform);

  // Initialize scroll manager
  console.log('[Firefox Main] Creating scroll manager');
  const scrollManager = createScrollManager(platform, getCurrentDocumentUrl);
  const { cancelScrollRestore, restoreScrollPosition, getSavedScrollPosition } = scrollManager;

  // Initialize TOC manager
  console.log('[Firefox Main] Creating TOC manager');
  const tocManager = createTocManager(saveFileState, getFileState);
  const { generateTOC, setupTocToggle, updateActiveTocItem, setupResponsiveToc } = tocManager;

  // Get the raw markdown content
  console.log('[Firefox Main] Getting raw content');
  const rawContent = document.body.textContent || '';
  console.log('[Firefox Main] Raw content length:', rawContent.length);
  
  // Get the current document URL to determine file type
  const currentUrl = getCurrentDocumentUrl();
  console.log('[Firefox Main] Current URL:', currentUrl);
  
  // Wrap non-markdown file content (e.g., mermaid, vega) in markdown format
  const rawMarkdown = wrapFileContent(rawContent, currentUrl);
  console.log('[Firefox Main] Wrapped markdown length:', rawMarkdown.length);

  // Get saved state early to prevent any flashing
  console.log('[Firefox Main] Getting initial file state...');
  const initialState = await getFileState();
  console.log('[Firefox Main] Initial state retrieved:', initialState);

  // Layout configurations
  console.log('[Firefox Main] Setting up layout configs...');
  const layoutTitles: LayoutTitles = {
    normal: translate('toolbar_layout_title_normal'),
    fullscreen: translate('toolbar_layout_title_fullscreen'),
    narrow: translate('toolbar_layout_title_narrow'),
  };

  const layoutConfigs: LayoutConfigs = {
    normal: { maxWidth: '1360px', icon: layoutIcons.normal, title: layoutTitles.normal },
    fullscreen: { maxWidth: '100%', icon: layoutIcons.fullscreen, title: layoutTitles.fullscreen },
    narrow: { maxWidth: '680px', icon: layoutIcons.narrow, title: layoutTitles.narrow },
  };

  type LayoutMode = keyof LayoutConfigs;
  const initialLayout: LayoutMode =
    initialState.layoutMode && layoutConfigs[initialState.layoutMode as LayoutMode]
      ? (initialState.layoutMode as LayoutMode)
      : 'normal';
  const initialMaxWidth = layoutConfigs[initialLayout].maxWidth;
  const initialZoom = initialState.zoom || 100;

  // Default TOC visibility based on screen width if no saved state
  let initialTocVisible: boolean;
  if (initialState.tocVisible !== undefined) {
    initialTocVisible = initialState.tocVisible;
  } else {
    initialTocVisible = window.innerWidth > 1024;
  }
  const initialTocClass = initialTocVisible ? '' : ' hidden';

  const toolbarPrintDisabledTitle = translate('toolbar_print_disabled_title');

  // Initialize toolbar manager
  const toolbarManager = createToolbarManager({
    translate,
    escapeHtml,
    saveFileState,
    getFileState,
    rawMarkdown,
    docxExporter,
    cancelScrollRestore,
    updateActiveTocItem,
    toolbarPrintDisabledTitle,
  });

  toolbarManager.setInitialZoom(initialZoom);

  // UI layout (Firefox-specific, same as Chrome)
  console.log('[Firefox Main] Generating toolbar HTML...');
  document.body.innerHTML = generateToolbarHTML({
    translate,
    escapeHtml,
    initialTocClass,
    initialMaxWidth,
    initialZoom,
  });
  console.log('[Firefox Main] Toolbar HTML generated');

  if (!initialTocVisible) {
    document.body.classList.add('toc-hidden');
  }

  // Wait a bit for DOM to be ready, then start processing
  console.log('[Firefox Main] Starting setTimeout for render...');
  setTimeout(async () => {
    console.log('[Firefox Main] setTimeout callback started');
    const savedScrollPosition = await getSavedScrollPosition();
    console.log('[Firefox Main] Got saved scroll position:', savedScrollPosition);

    toolbarManager.initializeToolbar();
    console.log('[Firefox Main] Toolbar initialized, starting render...');

    await renderMarkdown(rawMarkdown, savedScrollPosition);
    console.log('[Firefox Main] renderMarkdown completed');

    await saveToHistory(platform);
    setupTocToggle();
    toolbarManager.setupKeyboardShortcuts();
    await setupResponsiveToc();
  }, 100);

  // Listen for scroll events and save position to background script
  let scrollTimeout: ReturnType<typeof setTimeout>;
  window.addEventListener('scroll', () => {
    updateActiveTocItem();
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const currentPosition = window.scrollY || window.pageYOffset;
      saveFileState({ scrollPosition: currentPosition });
    }, 300);
  });

  async function renderMarkdown(markdown: string, savedScrollPosition = 0): Promise<void> {
    const contentDiv = document.getElementById('markdown-content') as HTMLElement | null;
    if (!contentDiv) {
      console.error('markdown-content div not found!');
      return;
    }

    // Load and apply theme
    let themeConfig: RendererThemeConfig | null = null;
    try {
      const themeId = await themeManager.loadSelectedTheme();
      const theme = await themeManager.loadTheme(themeId);
      await loadAndApplyTheme(themeId);

      if (theme && theme.fontScheme && theme.fontScheme.body) {
        const fontFamily = themeManager.buildFontFamily(theme.fontScheme.body.fontFamily);
        const fontSize = parseFloat(theme.fontScheme.body.fontSize);
        themeConfig = { fontFamily, fontSize };
        await platform.renderer.setThemeConfig(themeConfig);
      }
    } catch (error) {
      console.error('Failed to load theme, using defaults:', error);
    }

    // Render markdown using shared orchestration
    const result = await renderMarkdownDocument({
      markdown,
      container: contentDiv,
      renderer: pluginRenderer,
      translate,
      clearContainer: true,
      processTasks: false,
      onHeadings: () => {
        // Update TOC progressively as chunks are rendered
        void generateTOC();
      },
      onStreamingComplete: () => {
        // Streaming is complete, all initial DOM content is ready
        // Apply zoom and restore scroll position now
        toolbarManager.applyZoom(toolbarManager.getZoomLevel(), false);
        restoreScrollPosition(savedScrollPosition);
        setTimeout(updateActiveTocItem, 100);
      },
    });

    // Process async tasks after the initial render (keeps the page responsive)
    setTimeout(async () => {
      showProcessingIndicator();
      try {
        await result.taskManager.processAll((completed, total) => {
          updateProgress(completed, total);
        });
      } finally {
        hideProcessingIndicator();
      }
    }, 200);
  }
}

// Message listener interface
interface ContentMessage {
  type?: string;
  locale?: string;
  payload?: unknown;
  themeId?: string;
}

platform.message.addListener((message: unknown) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  const msg = message as ContentMessage;

  const nextLocale = (locale: string) => {
    Localization.setPreferredLocale(locale)
      .catch((error) => {
        console.error('Failed to update locale in main script:', error);
      })
      .finally(() => {
        window.location.reload();
      });
  };

  if (msg.type === 'LOCALE_CHANGED') {
    const payload = msg.payload && typeof msg.payload === 'object' ? (msg.payload as Record<string, unknown>) : null;
    const locale = payload && typeof payload.locale === 'string' && payload.locale.length > 0 ? payload.locale : DEFAULT_SETTING_LOCALE;
    nextLocale(locale);
    return;
  }

  if (msg.type === 'THEME_CHANGED') {
    window.location.reload();
    return;
  }
});

Localization.init()
  .catch((error) => {
    console.error('Localization init failed in main script:', error);
  })
  .finally(() => {
    void initializeMain();
  });
