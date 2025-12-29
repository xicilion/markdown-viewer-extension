/**
 * VSCode Toolbar Component
 * 
 * A minimal, single-line toolbar for VS Code webview:
 * - Left: filename display
 * - Right: download button, settings button
 */

import Localization from '../../../src/utils/localization';

export interface ToolbarOptions {
  /** File name to display */
  filename?: string;
  /** Download button click handler */
  onDownload?: () => void;
  /** Settings button click handler */
  onSettings?: () => void;
}

export interface Toolbar {
  /** Update the displayed filename */
  setFilename: (filename: string) => void;
  /** Get the toolbar element */
  getElement: () => HTMLElement;
  /** Cleanup */
  dispose: () => void;
}

/**
 * Create VSCode toolbar
 */
export function createToolbar(options: ToolbarOptions): Toolbar {
  const { filename = '', onDownload, onSettings } = options;

  // Create toolbar container
  const toolbar = document.createElement('div');
  toolbar.className = 'vscode-toolbar';
  toolbar.innerHTML = `
    <div class="vscode-toolbar-left">
      <span class="vscode-toolbar-filename" title="${filename}">${filename}</span>
    </div>
    <div class="vscode-toolbar-right">
      <button class="vscode-toolbar-btn" data-action="download" title="${Localization.translate('toolbar_download_title')}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 12l-4-4h2.5V3h3v5H12L8 12z"/>
          <path d="M3 13h10v1H3v-1z"/>
        </svg>
      </button>
      <button class="vscode-toolbar-btn" data-action="settings" title="${Localization.translate('tab_settings')}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.8 1.3-2-.8-.8-2 1.3-.7-.2zM8 10c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
        </svg>
      </button>
    </div>
  `;

  // Bind events
  const filenameEl = toolbar.querySelector('.vscode-toolbar-filename') as HTMLElement;
  const downloadBtn = toolbar.querySelector('[data-action="download"]') as HTMLButtonElement;
  const settingsBtn = toolbar.querySelector('[data-action="settings"]') as HTMLButtonElement;

  if (downloadBtn && onDownload) {
    downloadBtn.addEventListener('click', onDownload);
  }

  if (settingsBtn && onSettings) {
    settingsBtn.addEventListener('click', onSettings);
  }

  return {
    setFilename(name: string): void {
      if (filenameEl) {
        filenameEl.textContent = name;
        filenameEl.title = name;
      }
    },

    getElement(): HTMLElement {
      return toolbar;
    },

    dispose(): void {
      toolbar.remove();
    }
  };
}
