/**
 * VSCode Settings Panel Component
 * 
 * A dropdown settings panel that appears when clicking the settings button.
 * Includes: theme selector, language, DOCX options.
 * 
 * Languages and themes are loaded dynamically from registry.json files.
 */

import Localization from '../../../src/utils/localization';

export interface SettingsPanelOptions {
  /** Current theme ID */
  currentTheme?: string;
  /** Current locale */
  currentLocale?: string;
  /** DOCX HR as page break setting */
  docxHrAsPageBreak?: boolean;
  /** Theme changed callback */
  onThemeChange?: (themeId: string) => void;
  /** Locale changed callback */
  onLocaleChange?: (locale: string) => void;
  /** DOCX setting changed callback */
  onDocxSettingChange?: (hrAsPageBreak: boolean) => void;
  /** Cache clear callback */
  onClearCache?: () => Promise<void>;
  /** Called when panel is shown, use to refresh dynamic data */
  onShow?: () => void;
  /** Close panel callback */
  onClose?: () => void;
}

export interface SettingsPanel {
  /** Show the panel */
  show: (anchorEl: HTMLElement) => void;
  /** Hide the panel */
  hide: () => void;
  /** Check if panel is visible */
  isVisible: () => boolean;
  /** Update theme list */
  setThemes: (themes: ThemeOption[]) => void;
  /** Update locale list */
  setLocales: (locales: LocaleOption[]) => void;
  /** Update UI labels after locale change */
  updateLabels: () => void;
  /** Update cache stats display */
  setCacheStats: (stats: CacheStats) => void;
  /** Get the panel element */
  getElement: () => HTMLElement;
  /** Cleanup */
  dispose: () => void;
}

export interface ThemeOption {
  id: string;
  name: string;
  category?: string;
}

export interface LocaleOption {
  code: string;
  name: string;
}

export interface CacheStats {
  itemCount: number;
  totalSizeMB: string;
  maxItems: number;
}

/**
 * Create settings panel
 */
export function createSettingsPanel(options: SettingsPanelOptions): SettingsPanel {
  const {
    currentTheme = 'default',
    currentLocale = 'auto',
    docxHrAsPageBreak = true,
    onThemeChange,
    onLocaleChange,
    onDocxSettingChange,
    onClose
  } = options;

  let visible = false;

  // Create panel container
  const panel = document.createElement('div');
  panel.className = 'vscode-settings-panel';
  panel.style.display = 'none';

  panel.innerHTML = `
    <div class="vscode-settings-header">
      <span class="vscode-settings-title" data-i18n="tab_settings">${Localization.translate('tab_settings')}</span>
      <button class="vscode-settings-close" data-i18n-title="close" title="${Localization.translate('close') || 'Close'}">×</button>
    </div>
    <div class="vscode-settings-content">
      <div class="vscode-settings-group">
        <label class="vscode-settings-label" data-i18n="settings_language_label">${Localization.translate('settings_language_label')}</label>
        <select class="vscode-settings-select" data-setting="locale">
          <option value="auto" data-i18n="settings_language_auto">${Localization.translate('settings_language_auto')}</option>
        </select>
      </div>
      <div class="vscode-settings-group">
        <label class="vscode-settings-label" data-i18n="settings_theme_label">${Localization.translate('settings_theme_label')}</label>
        <select class="vscode-settings-select" data-setting="theme">
          <option value="default">Default</option>
        </select>
      </div>
      <div class="vscode-settings-group">
        <label class="vscode-settings-checkbox">
          <input type="checkbox" data-setting="docxHrPageBreak" ${docxHrAsPageBreak ? 'checked' : ''}>
          <span data-i18n="settings_docx_hr_page_break">${Localization.translate('settings_docx_hr_page_break')}</span>
        </label>
      </div>
      <div class="vscode-settings-divider"></div>
      <div class="vscode-settings-group">
        <div class="vscode-cache-stats">
          <div class="vscode-cache-stat-item">
            <span class="vscode-cache-stat-label" data-i18n="cache_stat_item_label">${Localization.translate('cache_stat_item_label')}</span>
            <span class="vscode-cache-stat-value" data-cache-stat="items">-</span>
          </div>
          <div class="vscode-cache-stat-item">
            <span class="vscode-cache-stat-label" data-i18n="cache_stat_size_label">${Localization.translate('cache_stat_size_label')}</span>
            <span class="vscode-cache-stat-value" data-cache-stat="size">-</span>
          </div>
        </div>
        <button class="vscode-cache-clear-btn" data-i18n="cache_clear">${Localization.translate('cache_clear')}</button>
      </div>
    </div>
  `;

  // Get elements
  const closeBtn = panel.querySelector('.vscode-settings-close') as HTMLButtonElement;
  const themeSelect = panel.querySelector('[data-setting="theme"]') as HTMLSelectElement;
  const localeSelect = panel.querySelector('[data-setting="locale"]') as HTMLSelectElement;
  const docxCheckbox = panel.querySelector('[data-setting="docxHrPageBreak"]') as HTMLInputElement;
  const clearCacheBtn = panel.querySelector('.vscode-cache-clear-btn') as HTMLButtonElement;
  const cacheItemsValue = panel.querySelector('[data-cache-stat="items"]') as HTMLElement;
  const cacheSizeValue = panel.querySelector('[data-cache-stat="size"]') as HTMLElement;

  // Bind events
  closeBtn?.addEventListener('click', () => {
    hide();
    onClose?.();
  });

  themeSelect?.addEventListener('change', () => {
    onThemeChange?.(themeSelect.value);
  });

  localeSelect?.addEventListener('change', () => {
    onLocaleChange?.(localeSelect.value);
  });

  docxCheckbox?.addEventListener('change', () => {
    onDocxSettingChange?.(docxCheckbox.checked);
  });

  // Handle clear cache button - no confirm dialog in sandboxed webview
  // Just clear directly, the action is not destructive enough to warrant confirmation
  clearCacheBtn?.addEventListener('click', async () => {
    clearCacheBtn.disabled = true;
    clearCacheBtn.textContent = '...';
    try {
      await options.onClearCache?.();
    } catch (err) {
      console.error('Failed to clear cache:', err);
    } finally {
      clearCacheBtn.disabled = false;
      clearCacheBtn.textContent = Localization.translate('cache_clear');
    }
  });

  // Click outside to close
  const handleClickOutside = (e: MouseEvent) => {
    if (visible && !panel.contains(e.target as Node)) {
      // Don't close if clicking the settings button itself
      const target = e.target as HTMLElement;
      if (target.closest('[data-action="settings"]')) {
        return;
      }
      hide();
      onClose?.();
    }
  };

  function show(anchorEl: HTMLElement): void {
    if (visible) return;
    
    // Position panel below anchor, aligned to right edge
    const rect = anchorEl.getBoundingClientRect();
    const panelWidth = 280;
    
    // Calculate left position: align panel right edge with button right edge
    let left = rect.right - panelWidth;
    if (left < 8) left = 8; // Don't go off left edge
    
    console.log('[Settings Panel] Anchor rect:', rect);
    console.log('[Settings Panel] Calculated left:', left);
    
    panel.style.position = 'fixed';
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.left = `${left}px`;
    panel.style.right = 'auto';
    panel.style.display = 'block';
    panel.style.zIndex = '10000';
    visible = true;
    
    console.log('[Settings Panel] Panel styles applied');

    // Notify caller to refresh dynamic data (e.g., cache stats)
    options.onShow?.();

    // Add click outside listener (delayed to avoid immediate close from the same click)
    requestAnimationFrame(() => {
      document.addEventListener('click', handleClickOutside);
    });
  }

  function hide(): void {
    if (!visible) return;
    
    panel.style.display = 'none';
    visible = false;
    document.removeEventListener('click', handleClickOutside);
  }

  function setThemes(themes: ThemeOption[]): void {
    if (!themeSelect) return;

    // Group by category
    const byCategory = new Map<string, ThemeOption[]>();
    themes.forEach(theme => {
      const cat = theme.category || 'Other';
      if (!byCategory.has(cat)) {
        byCategory.set(cat, []);
      }
      byCategory.get(cat)!.push(theme);
    });

    // Build options
    themeSelect.innerHTML = '';
    
    if (byCategory.size <= 1) {
      // No categories or single category, just list themes
      themes.forEach(theme => {
        const opt = document.createElement('option');
        opt.value = theme.id;
        opt.textContent = theme.name;
        opt.selected = theme.id === currentTheme;
        themeSelect.appendChild(opt);
      });
    } else {
      // Group by category
      byCategory.forEach((catThemes, category) => {
        const group = document.createElement('optgroup');
        group.label = category;
        
        catThemes.forEach(theme => {
          const opt = document.createElement('option');
          opt.value = theme.id;
          opt.textContent = theme.name;
          opt.selected = theme.id === currentTheme;
          group.appendChild(opt);
        });
        
        themeSelect.appendChild(group);
      });
    }
  }

  function setLocales(locales: LocaleOption[]): void {
    if (!localeSelect) return;

    // Keep auto option, add loaded locales
    localeSelect.innerHTML = `<option value="auto" data-i18n="settings_language_auto">${Localization.translate('settings_language_auto')}</option>`;
    
    locales.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.code;
      opt.textContent = loc.name;
      opt.selected = loc.code === currentLocale;
      localeSelect.appendChild(opt);
    });
  }

  function updateLabels(): void {
    // Update all elements with data-i18n attribute
    panel.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = Localization.translate(key);
      }
    });
    // Update elements with data-i18n-title attribute
    panel.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        (el as HTMLElement).title = Localization.translate(key) || '';
      }
    });
  }

  function setCacheStats(stats: CacheStats): void {
    if (cacheItemsValue) {
      cacheItemsValue.textContent = `${stats.itemCount}/${stats.maxItems}`;
    }
    if (cacheSizeValue) {
      cacheSizeValue.textContent = stats.totalSizeMB;
    }
  }

  return {
    show,
    hide,
    isVisible: () => visible,
    setThemes,
    setLocales,
    updateLabels,
    setCacheStats,
    getElement: () => panel,
    dispose(): void {
      document.removeEventListener('click', handleClickOutside);
      panel.remove();
    }
  };
}
