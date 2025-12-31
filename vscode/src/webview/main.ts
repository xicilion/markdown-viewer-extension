/**
 * VS Code Webview Entry Point
 * 
 * Main entry point for the webview that renders Markdown content.
 * This runs inside the VS Code webview and uses the platform abstraction.
 * 
 * Shares core rendering logic with Chrome and Mobile platforms.
 */

import { platform, vscodeBridge } from './api-impl';
import { renderMarkdownDocument } from '../../../src/core/viewer/viewer-controller';
import { AsyncTaskManager } from '../../../src/core/markdown-processor';
import { wrapFileContent } from '../../../src/utils/file-wrapper';
// Shared modules (same as Chrome/Mobile)
import Localization from '../../../src/utils/localization';
import themeManager from '../../../src/utils/theme-manager';
import DocxExporter from '../../../src/exporters/docx-exporter';
import {
  loadAndApplyTheme,
  applyThemeFromData,
  type ThemeConfig,
  type TableStyleConfig,
  type CodeThemeConfig,
  type SpacingScheme,
  type FontConfig
} from '../../../src/utils/theme-to-css';
import type { PluginRenderer, PlatformAPI } from '../../../src/types/index';
import type { FontConfigFile } from '../../../src/utils/theme-manager';

// VSCode-specific UI components
import { createSettingsPanel, type SettingsPanel, type ThemeOption, type LocaleOption } from './settings-panel';

// Declare global types for VSCode-specific variables
declare global {
  var VSCODE_WEBVIEW_BASE_URI: string;
  var VSCODE_CONFIG: Record<string, unknown>;
}

// Make platform globally available (same as Chrome/Mobile)
globalThis.platform = platform as unknown as PlatformAPI;

// ============================================================================
// Global State (same pattern as Mobile)
// ============================================================================

let currentMarkdown = '';
let currentFilename = '';
let currentThemeId = 'default';
let currentTaskManager: AsyncTaskManager | null = null;
let currentZoomLevel = 1;
let lastRenderedFilename = '';  // Track last rendered file for incremental updates

// UI components
let settingsPanel: SettingsPanel | null = null;

/**
 * Theme data structure (same as Mobile)
 */
interface ThemeData {
  fontConfig?: FontConfig;
  theme?: ThemeConfig & { id?: string };
  tableStyle?: TableStyleConfig;
  codeTheme?: CodeThemeConfig;
  spacing?: SpacingScheme;
}

let currentThemeData: ThemeData | null = null;

// ============================================================================
// Plugin Renderer (shared pattern)
// ============================================================================

function createPluginRenderer(): PluginRenderer {
  return {
    render: async (type, content, _context) => {
      const result = await platform.renderer.render(type, content);
      return {
        base64: result.base64,
        width: result.width,
        height: result.height,
        format: result.format,
        error: undefined
      };
    }
  };
}

// ============================================================================
// Initialization (similar to Mobile)
// ============================================================================

async function initialize(): Promise<void> {
  try {
    // Set resource base URI
    if (window.VSCODE_WEBVIEW_BASE_URI) {
      platform.setResourceBaseUri(window.VSCODE_WEBVIEW_BASE_URI);
    }

    // Initialize platform (includes renderer initialization)
    await platform.init();

    // Initialize localization (shared with Chrome/Mobile)
    await Localization.init();

    // Initialize toolbar and settings panel
    initializeUI();

    // Render iframe is lazily created on first render request
    // No pre-initialization needed - ensureReady() is called in render()

    // Load saved theme from config (default to 'default' theme)
    if (window.VSCODE_CONFIG?.theme && window.VSCODE_CONFIG.theme !== 'auto') {
      currentThemeId = window.VSCODE_CONFIG.theme as string;
    } else {
      currentThemeId = 'default';
    }

    // Try to load and apply initial theme
    try {
      await loadAndApplyTheme(currentThemeId);
    } catch (error) {
      console.warn('[VSCode Webview] Failed to load theme, using defaults:', error);
    }

    // Load themes and locales for settings panel
    loadThemesForSettings();
    loadLocalesForSettings();
    loadCacheStats();

    // Listen for messages from extension host
    vscodeBridge.addListener((message) => {
      handleExtensionMessage(message as ExtensionMessage);
    });

    // Notify extension that webview is ready
    vscodeBridge.postMessage('READY', {});
  } catch (error) {
    console.error('[VSCode Webview] Init failed:', error);
  }
}

// ============================================================================
// Message Handlers (similar to Mobile)
// ============================================================================

interface ExtensionMessage {
  type?: string;
  payload?: unknown;
}

interface UpdateContentPayload {
  content: string;
  filename?: string;
  themeDataJson?: string;
}

interface SetThemePayload {
  themeId: string;
  themeData?: ThemeData;
}

interface SetZoomPayload {
  zoom: number;
}

interface ScrollToLinePayload {
  line: number;
}

function handleExtensionMessage(message: ExtensionMessage): void {
  const { type, payload } = message;

  switch (type) {
    case 'UPDATE_CONTENT':
      handleUpdateContent(payload as UpdateContentPayload);
      break;

    case 'EXPORT_DOCX':
      handleExportDocx();
      break;

    case 'SET_THEME':
      handleSetTheme(payload as SetThemePayload);
      break;

    case 'SET_ZOOM':
      handleSetZoom(payload as SetZoomPayload);
      break;

    case 'OPEN_SETTINGS':
      handleOpenSettings();
      break;

    case 'SCROLL_TO_LINE':
      handleScrollToLine(payload as ScrollToLinePayload);
      break;

    default:
      // Ignore unknown messages or responses
      break;
  }
}

// ============================================================================
// Content Handling (same logic as Mobile)
// ============================================================================

async function handleUpdateContent(payload: UpdateContentPayload): Promise<void> {
  const { content, filename, themeDataJson } = payload;
  const container = document.getElementById('markdown-content');
  
  if (!container) {
    console.error('[VSCode Webview] Content container not found');
    return;
  }

  // Cancel any pending async tasks from previous render
  if (currentTaskManager) {
    currentTaskManager.abort();
    currentTaskManager = null;
  }

  // Check if file changed - reset incremental update flag if different file
  const newFilename = filename || 'document.md';
  const fileChanged = currentFilename !== newFilename;

  // Wrap non-markdown file content (mermaid, vega, graphviz, infographic)
  const wrappedContent = wrapFileContent(content, newFilename);
  
  currentMarkdown = wrappedContent;
  currentFilename = newFilename;

  try {
    // If theme data is provided with content, apply it (same as Mobile)
    if (themeDataJson) {
      try {
        const data = JSON.parse(themeDataJson) as ThemeData;
        currentThemeData = data;
        
        // Initialize themeManager with font config
        if (data.fontConfig && typeof data.fontConfig === 'object' && 'fonts' in data.fontConfig) {
          themeManager.initializeWithData(data.fontConfig as unknown as FontConfigFile);
        }
      } catch (e) {
        console.error('[VSCode Webview] Failed to parse theme data:', e);
      }
    }

    // Capture theme data at render time (same pattern as Mobile)
    const renderThemeData = currentThemeData;

    // Create task manager
    const taskManager = new AsyncTaskManager((key: string, subs?: string | string[]) => 
      Localization.translate(key, subs)
    );
    currentTaskManager = taskManager;

    // NOTE: Don't eagerly create iframe here!
    // The iframe will be created lazily only when a diagram needs to be rendered.
    // This is handled inside platform.renderer.render() which calls ensureReady() internally.

    const pluginRenderer = createPluginRenderer();

    // Only clear container when file changes (for incremental update support)
    if (fileChanged) {
      container.innerHTML = '';
      // Immediately scroll to top after resetting container
      // This ensures:
      // 1. Subsequent SCROLL_TO_LINE starts from top, avoiding position conflicts
      // 2. When line is 0, preview is already at top
      const scrollContainer = document.getElementById('vscode-content');
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'auto' });
      }
    }

    // Apply theme CSS if we have theme data
    if (renderThemeData) {
      const { fontConfig, theme, tableStyle, codeTheme, spacing } = renderThemeData;

      if (theme && tableStyle && codeTheme && spacing) {
        applyThemeFromData(theme, tableStyle, codeTheme, spacing, fontConfig);
      }

      // Set renderer theme config for diagrams
      if (theme?.fontScheme?.body) {
        const fontFamily = themeManager.buildFontFamily(theme.fontScheme.body.fontFamily);
        const fontSize = parseFloat(theme.fontScheme.body.fontSize || '16');
        await platform.renderer.setThemeConfig({ fontFamily, fontSize });
      }
    }

    // Apply zoom level before rendering
    if (currentZoomLevel !== 1) {
      (container as HTMLElement).style.zoom = String(currentZoomLevel);
    }

    // Determine incremental update conditions
    const shouldIncremental = !fileChanged && container.childNodes.length > 0;

    // Render markdown (same as Mobile)
    // Use incremental update only if same file and container has existing content
    const renderResult = await renderMarkdownDocument({
      markdown: wrappedContent,
      container: container as HTMLElement,
      renderer: pluginRenderer,
      translate: (key: string, subs?: string | string[]) => Localization.translate(key, subs),
      taskManager,
      clearContainer: fileChanged,  // Clear only when file changes
      incrementalUpdate: shouldIncremental,  // Only incremental for same file
      processTasks: true,
      onHeadings: (headings) => {
        vscodeBridge.postMessage('HEADINGS_UPDATED', headings);
      },
      onProgress: (completed, total) => {
        if (!taskManager.isAborted()) {
          vscodeBridge.postMessage('RENDER_PROGRESS', { completed, total });
        }
      },
      postProcess: async (el) => {
        await postProcessContent(el);
      },
    });

    // Track the file we just rendered
    if (!taskManager.isAborted()) {
      lastRenderedFilename = currentFilename;
    }

    if (taskManager.isAborted()) {
      return;
    }

    // Clear task manager reference
    if (currentTaskManager === taskManager) {
      currentTaskManager = null;
    }

    // Notify extension host
    vscodeBridge.postMessage('RENDER_COMPLETE', {
      filename: currentFilename,
      title: renderResult.title || currentFilename
    });

    // Note: Scrolling is handled by SCROLL_TO_LINE messages from the extension
    // which are triggered by onDidChangeTextEditorVisibleRanges.
    // We don't scroll here because:
    // 1. The extension's TopmostLineMonitor tracks the scroll position per document
    // 2. When switching files, scrollToLine() is called after setDocument()
    // 3. Scrolling here with initialLine could conflict with the scroll sync

  } catch (error) {
    console.error('[VSCode Webview] Render failed:', error);
    vscodeBridge.postMessage('RENDER_ERROR', {
      error: (error as Error).message
    });
  }
}

// ============================================================================
// Post-process Content (same as Mobile)
// ============================================================================

async function postProcessContent(_container: Element): Promise<void> {
  // Link click handling is done via event delegation in initializeUI
  // No per-element processing needed here
}

// ============================================================================
// Theme Handling (similar to Mobile)
// ============================================================================

async function handleSetTheme(payload: SetThemePayload): Promise<void> {
  const { themeId, themeData } = payload;

  try {
    currentThemeId = themeId;

    if (themeData) {
      // Use provided theme data (same as Mobile applyThemeData)
      currentThemeData = themeData;

      if (themeData.fontConfig && typeof themeData.fontConfig === 'object' && 'fonts' in themeData.fontConfig) {
        themeManager.initializeWithData(themeData.fontConfig as unknown as FontConfigFile);
      }
    } else {
      // Load theme from resources (same as Chrome)
      await loadAndApplyTheme(themeId);
    }

    vscodeBridge.postMessage('THEME_CHANGED', { themeId });

    // Re-render if we have content
    if (currentMarkdown) {
      await handleUpdateContent({ content: currentMarkdown, filename: currentFilename });
    }
  } catch (error) {
    console.error('[VSCode Webview] Theme change failed:', error);
  }
}

// ============================================================================
// DOCX Export (same as Mobile)
// ============================================================================

async function handleExportDocx(): Promise<void> {
  try {
    // Convert filename
    let docxFilename = currentFilename || 'document.docx';
    if (docxFilename.toLowerCase().endsWith('.md')) {
      docxFilename = docxFilename.slice(0, -3) + '.docx';
    } else if (docxFilename.toLowerCase().endsWith('.markdown')) {
      docxFilename = docxFilename.slice(0, -9) + '.docx';
    } else if (!docxFilename.toLowerCase().endsWith('.docx')) {
      docxFilename = docxFilename + '.docx';
    }

    const exporter = new DocxExporter(createPluginRenderer());

    // Report progress
    const onProgress = (completed: number, total: number) => {
      vscodeBridge.postMessage('EXPORT_PROGRESS', { completed, total, phase: 'processing' });
    };

    const result = await exporter.exportToDocx(currentMarkdown, docxFilename, onProgress);

    if (!result.success) {
      throw new Error(result.error || 'Export failed');
    }

    vscodeBridge.postMessage('EXPORT_DOCX_RESULT', { success: true, filename: docxFilename });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[VSCode Webview] DOCX export failed:', errMsg);
    vscodeBridge.postMessage('EXPORT_DOCX_RESULT', { success: false, error: errMsg });
  }
}

// ============================================================================
// Zoom Handling (same as Mobile)
// ============================================================================

function handleSetZoom(payload: SetZoomPayload): void {
  const { zoom } = payload;
  currentZoomLevel = zoom / 100; // Convert percentage to decimal
  
  const container = document.getElementById('markdown-content');
  if (container) {
    (container as HTMLElement).style.zoom = String(currentZoomLevel);
  }
}

// ============================================================================
// Window API (for extension host to call directly, same pattern as Mobile)
// ============================================================================

declare global {
  interface Window {
    loadMarkdown: (content: string, filename?: string, themeDataJson?: string) => void;
    setTheme: (themeId: string) => void;
    setZoom: (zoom: number) => void;
    exportDocx: () => void;
  }
}

window.loadMarkdown = (content: string, filename?: string, themeDataJson?: string) => {
  handleUpdateContent({ content, filename, themeDataJson });
};

window.setTheme = (themeId: string) => {
  handleSetTheme({ themeId });
};

window.setZoom = (zoom: number) => {
  handleSetZoom({ zoom });
};

window.exportDocx = () => {
  handleExportDocx();
};

// ============================================================================
// UI Initialization
// ============================================================================

function initializeUI(): void {
  // Setup link click handling via event delegation
  // This ensures all links (including dynamically added ones) are handled
  const contentContainer = document.getElementById('markdown-content');
  if (contentContainer) {
    contentContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      
      const href = anchor.getAttribute('href') || '';
      e.preventDefault();
      e.stopPropagation();
      
      // External links (http/https) - open in external browser
      if (href.startsWith('http://') || href.startsWith('https://')) {
        vscodeBridge.postMessage('OPEN_URL', { url: href });
      }
      // Anchor links
      else if (href.startsWith('#')) {
        const targetId = href.slice(1);
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      }
      // Relative links (including .md files)
      else {
        vscodeBridge.postMessage('OPEN_RELATIVE_FILE', { path: href });
      }
    });
  }

  // Create settings panel (needs to be in DOM for positioning)
  settingsPanel = createSettingsPanel({
    currentTheme: currentThemeId,
    currentLocale: window.VSCODE_CONFIG?.locale as string || 'auto',
    docxHrAsPageBreak: window.VSCODE_CONFIG?.docxHrAsPageBreak !== false,
    onThemeChange: async (themeId) => {
      await handleSetTheme({ themeId });
      // Save to extension settings
      vscodeBridge.postMessage('SAVE_SETTING', { key: 'theme', value: themeId });
    },
    onLocaleChange: async (locale) => {
      await Localization.setPreferredLocale(locale);
      vscodeBridge.postMessage('SAVE_SETTING', { key: 'locale', value: locale });
      
      // Update settings panel labels
      settingsPanel?.updateLabels();
      
      // Reload themes with new locale names
      await loadThemesForSettings();
      
      // Re-render to apply new locale
      if (currentMarkdown) {
        await handleUpdateContent({ content: currentMarkdown, filename: currentFilename });
      }
    },
    onDocxSettingChange: (hrAsPageBreak) => {
      vscodeBridge.postMessage('SAVE_SETTING', { key: 'docxHrAsPageBreak', value: hrAsPageBreak });
    },
    onClearCache: async () => {
      await platform.cache.clear();
      // Reload cache stats
      await loadCacheStats();
    },
    onShow: () => {
      // Refresh cache stats when panel is shown
      loadCacheStats();
    }
  });
  document.body.appendChild(settingsPanel.getElement());
}

/**
 * Handle open settings command from extension host
 */
function handleOpenSettings(): void {
  if (settingsPanel) {
    if (settingsPanel.isVisible()) {
      settingsPanel.hide();
    } else {
      // Show settings panel at a fixed position (top-right corner)
      settingsPanel.showAtPosition(window.innerWidth - 300, 10);
    }
  }
}

/**
 * Load available themes for settings panel
 */
async function loadThemesForSettings(): Promise<void> {
  if (!settingsPanel) return;

  try {
    // Fetch theme registry
    const registryUrl = platform.resource.getURL('themes/registry.json');
    const response = await fetch(registryUrl);
    const registry = await response.json() as {
      categories: Record<string, { name: string; name_en: string; order?: number }>;
      themes: Array<{ id: string; file: string; category: string; order?: number }>;
    };

    // Load theme metadata
    const themePromises = registry.themes.map(async (info) => {
      try {
        const url = platform.resource.getURL(`themes/presets/${info.file}`);
        const res = await fetch(url);
        const data = await res.json() as { id: string; name: string; name_en: string };
        const locale = Localization.getLocale();
        const useEnglish = !locale.startsWith('zh');
        const categoryInfo = registry.categories[info.category];
        return {
          id: data.id,
          name: useEnglish ? data.name_en : data.name,
          category: categoryInfo
            ? (useEnglish ? categoryInfo.name_en : categoryInfo.name)
            : info.category,
          categoryOrder: categoryInfo?.order ?? 999,
          themeOrder: info.order ?? 999
        } as ThemeOption & { categoryOrder: number; themeOrder: number };
      } catch {
        return null;
      }
    });

    const themes = (await Promise.all(themePromises))
      .filter((t): t is ThemeOption & { categoryOrder: number; themeOrder: number } => t !== null)
      // Sort by category order, then by theme order
      .sort((a, b) => {
        if (a.categoryOrder !== b.categoryOrder) {
          return a.categoryOrder - b.categoryOrder;
        }
        return a.themeOrder - b.themeOrder;
      });
    
    settingsPanel.setThemes(themes);
  } catch (error) {
    console.warn('[VSCode Webview] Failed to load themes:', error);
  }
}

/**
 * Load available locales for settings panel
 */
async function loadLocalesForSettings(): Promise<void> {
  if (!settingsPanel) return;

  try {
    const url = platform.resource.getURL('_locales/registry.json');
    const response = await fetch(url);
    const registry = await response.json() as {
      locales: Array<{ code: string; name: string }>;
    };

    settingsPanel.setLocales(registry.locales);
  } catch (error) {
    console.warn('[VSCode Webview] Failed to load locales:', error);
  }
}

/**
 * Load cache statistics for settings panel
 */
async function loadCacheStats(): Promise<void> {
  if (!settingsPanel) return;

  try {
    const stats = await platform.cache.getStats();
    if (stats) {
      settingsPanel.setCacheStats({
        itemCount: stats.itemCount,
        totalSizeMB: stats.totalSizeMB,
        maxItems: stats.maxItems
      });
    }
  } catch (error) {
    console.warn('[VSCode Webview] Failed to load cache stats:', error);
  }
}

// ============================================================================
// Scroll Sync Logic
// ============================================================================

const CODE_LINE_CLASS = 'code-line';

// Prevent infinite scroll loops
let scrollSyncDisabled = 0;
let lastSyncTime = 0;  // Track last sync time to avoid rapid cycles

/**
 * Get all elements with source line information
 */
interface CodeLineElement {
  element: HTMLElement;
  line: number;
  lineCount?: number;  // Number of lines in this block
}

function getCodeLineElements(): CodeLineElement[] {
  const elements: CodeLineElement[] = [];
  
  for (const el of document.getElementsByClassName(CODE_LINE_CLASS)) {
    if (!(el instanceof HTMLElement)) continue;
    
    const lineAttr = el.getAttribute('data-line');
    if (!lineAttr) continue;
    
    const line = parseInt(lineAttr, 10);
    if (isNaN(line)) continue;
    
    const lineCountAttr = el.getAttribute('data-line-count');
    const lineCount = lineCountAttr ? parseInt(lineCountAttr, 10) : undefined;
    
    elements.push({ element: el, line, lineCount });
  }
  
  // Sort by line number
  elements.sort((a, b) => a.line - b.line);
  return elements;
}

/**
 * Find elements for a specific source line
 */
function getElementsForSourceLine(targetLine: number): { previous?: CodeLineElement; next?: CodeLineElement } {
  const elements = getCodeLineElements();
  if (elements.length === 0) return {};
  
  let previous = elements[0];
  
  for (const entry of elements) {
    if (entry.line === targetLine) {
      return { previous: entry };
    } else if (entry.line > targetLine) {
      return { previous, next: entry };
    }
    previous = entry;
  }
  
  return { previous };
}

/**
 * Get line number for current scroll position with fine-grained interpolation
 */
function getLineForScrollPosition(container: HTMLElement): number | null {
  const elements = getCodeLineElements();
  if (elements.length === 0) return null;
  
  const containerRect = container.getBoundingClientRect();
  const scrollTop = container.scrollTop;
  
  // Find elements around current scroll position
  let previous = elements[0];
  
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const rect = el.element.getBoundingClientRect();
    // Calculate position relative to container's scrollable area
    const top = rect.top - containerRect.top + scrollTop;
    
    if (top > scrollTop) {
      // Found element below current position
      if (i === 0) return el.line;
      
      // Interpolate between previous and current
      const prevRect = previous.element.getBoundingClientRect();
      const prevTop = prevRect.top - containerRect.top + scrollTop;
      
      // If previous block has line count info, use fine-grained interpolation
      if (previous.lineCount && previous.lineCount > 0) {
        // Interpolate within the block based on height proportion
        const blockHeight = prevRect.height;
        if (blockHeight > 0) {
          const progressInBlock = (scrollTop - prevTop) / blockHeight;
          return previous.line + progressInBlock * previous.lineCount;
        }
      }
      
      // Fallback: interpolate between two blocks
      const progress = (scrollTop - prevTop) / (top - prevTop);
      return previous.line + progress * (el.line - previous.line);
    }
    
    previous = el;
  }
  
  // Past last element - use fine-grained interpolation if last block has line count
  if (previous.lineCount && previous.lineCount > 0) {
    const prevRect = previous.element.getBoundingClientRect();
    const prevTop = prevRect.top - containerRect.top + scrollTop;
    const blockHeight = prevRect.height;
    if (blockHeight > 0) {
      const progressInBlock = (scrollTop - prevTop) / blockHeight;
      return previous.line + progressInBlock * previous.lineCount;
    }
  }
  
  return previous.line;
}

/**
 * Scroll preview to reveal source line (Editor → Preview)
 */
function handleScrollToLine(payload: ScrollToLinePayload): void {
  const { line } = payload;
  
  const container = document.getElementById('vscode-content');
  if (!container) {
    return;
  }
  
  // For line 0 or negative, container is already at top after file switch
  // Just skip scrolling to avoid unnecessary computation
  if (line <= 0) {
    return;
  }
  
  const { previous, next } = getElementsForSourceLine(line);
  
  if (!previous) {
    return;
  }
  
  // Calculate position relative to container
  const containerRect = container.getBoundingClientRect();
  const rect = previous.element.getBoundingClientRect();
  const previousTop = rect.top - containerRect.top + container.scrollTop;
  
  let scrollTo = 0;
  
  if (next && next.line !== previous.line) {
    // Between two elements - interpolate
    const progress = (line - previous.line) / (next.line - previous.line);
    const nextRect = next.element.getBoundingClientRect();
    const nextTop = nextRect.top - containerRect.top + container.scrollTop;
    scrollTo = previousTop + progress * (nextTop - previousTop);
  } else {
    // At or past element
    const progress = line - Math.floor(line);
    scrollTo = previousTop + progress * rect.height;
  }
  
  // Temporarily disable reverse sync to prevent feedback loop
  scrollSyncDisabled = 2;  // Allow 2 scroll events before re-enabling
  lastSyncTime = Date.now();
  
  container.scrollTo({
    top: Math.max(0, scrollTo),
    behavior: 'auto'  // Use instant scroll for sync
  });
}

/**
 * Setup scroll listener to report position to extension (Preview → Editor)
 */
function setupScrollSyncListener(): void {
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 10;  // Minimal debounce to reduce latency
  const MIN_SYNC_INTERVAL_MS = 30;  // Minimum time between sync messages
  
  const contentContainer = document.getElementById('vscode-content');
  if (!contentContainer) return;
  
  contentContainer.addEventListener('scroll', () => {
    // If sync is disabled, decrement counter
    if (scrollSyncDisabled > 0) {
      scrollSyncDisabled--;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = null;
      return;
    }
    
    // Debounce scroll events with minimal delay
    if (scrollTimeout) clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      // Check if enough time has passed since last sync to avoid rapid cycles
      if (Date.now() - lastSyncTime < MIN_SYNC_INTERVAL_MS) {
        scrollTimeout = null;
        return;
      }
      
      const line = getLineForScrollPosition(contentContainer);
      if (line !== null && !isNaN(line)) {
        // Report scroll to extension for reverse sync
        lastSyncTime = Date.now();
        vscodeBridge.postMessage('REVEAL_LINE', { line });
      }
      scrollTimeout = null;
    }, DEBOUNCE_MS);
  });
}

// ============================================================================
// Entry Point
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initialize();
    setupScrollSyncListener();
  });
} else {
  initialize();
  setupScrollSyncListener();
}
