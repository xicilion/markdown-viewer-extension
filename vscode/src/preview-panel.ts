/**
 * Markdown Preview Panel
 * 
 * WebviewPanel implementation for rendering Markdown with advanced features.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { ExtensionCacheService } from './cache-service';

export class MarkdownPreviewPanel {
  public static currentPanel: MarkdownPreviewPanel | undefined;
  public static readonly viewType = 'markdownViewerAdvanced';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _cacheService: ExtensionCacheService;
  private _document: vscode.TextDocument | undefined;
  private _disposables: vscode.Disposable[] = [];
  private _uploadSessions: Map<string, UploadSession> = new Map();

  public static createOrShow(
    extensionUri: vscode.Uri,
    document: vscode.TextDocument,
    cacheService: ExtensionCacheService,
    column?: vscode.ViewColumn
  ): MarkdownPreviewPanel {
    const targetColumn = column || vscode.ViewColumn.Beside;

    // If panel already exists, show it
    if (MarkdownPreviewPanel.currentPanel) {
      MarkdownPreviewPanel.currentPanel._panel.reveal(targetColumn);
      MarkdownPreviewPanel.currentPanel.setDocument(document);
      return MarkdownPreviewPanel.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      MarkdownPreviewPanel.viewType,
      'Markdown Preview',
      targetColumn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'webview')
        ]
      }
    );

    MarkdownPreviewPanel.currentPanel = new MarkdownPreviewPanel(panel, extensionUri, document, cacheService);
    return MarkdownPreviewPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    document: vscode.TextDocument,
    cacheService: ExtensionCacheService
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._document = document;
    this._cacheService = cacheService;

    // Set initial content
    this._update();

    // Handle panel disposal
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle view state changes
    this._panel.onDidChangeViewState(
      () => {
        if (this._panel.visible) {
          this._update();
        }
      },
      null,
      this._disposables
    );

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      (message) => this._handleMessage(message),
      null,
      this._disposables
    );
  }

  public setDocument(document: vscode.TextDocument): void {
    this._document = document;
    this._panel.title = `Preview: ${path.basename(document.fileName)}`;
    this.updateContent(document.getText());
  }

  public isDocumentMatch(document: vscode.TextDocument): boolean {
    return this._document?.uri.toString() === document.uri.toString();
  }

  public updateContent(content: string): void {
    this._panel.webview.postMessage({
      type: 'UPDATE_CONTENT',
      payload: {
        content,
        filename: this._document ? path.basename(this._document.fileName) : 'untitled.md'
      }
    });
  }

  public refresh(): void {
    if (this._document) {
      this.updateContent(this._document.getText());
    }
  }

  public async exportToDocx(): Promise<void> {
    this._panel.webview.postMessage({
      type: 'EXPORT_DOCX'
    });
  }

  private async _handleMessage(message: { id?: string; type: string; requestId?: string; payload?: unknown }): Promise<void> {
    // Support both old format (requestId) and new envelope format (id)
    const { type, payload } = message;
    const requestId = message.id || message.requestId;

    try {
      let response: unknown;

      switch (type) {
        case 'STORAGE_GET':
          response = await this._handleStorageGet(payload as { keys: string | string[] });
          break;

        case 'STORAGE_SET':
          response = await this._handleStorageSet(payload as { items: Record<string, unknown> });
          break;

        case 'STORAGE_REMOVE':
          response = await this._handleStorageRemove(payload as { keys: string | string[] });
          break;

        case 'CACHE_OPERATION':
          response = await this._handleCacheOperation(payload as {
            operation: 'get' | 'set' | 'delete' | 'clear' | 'getStats';
            key?: string;
            value?: unknown;
            dataType?: string;
          });
          break;

        case 'DOWNLOAD_FILE':
          response = await this._handleDownload(payload as { filename: string; data: string; mimeType: string });
          break;

        case 'UPLOAD_OPERATION':
          response = await this._handleUploadOperation(payload as {
            operation: string;
            token?: string;
            chunk?: string;
            purpose?: string;
            encoding?: string;
            expectedSize?: number;
            chunkSize?: number;
            metadata?: Record<string, unknown>;
          });
          break;

        case 'DOCX_DOWNLOAD_FINALIZE':
          response = await this._handleDocxDownloadFinalize(payload as { token: string });
          break;

        case 'FETCH_ASSET':
          response = await this._handleFetchAsset(payload as { path: string });
          break;

        case 'RENDER_DIAGRAM':
          response = await this._handleRenderDiagram(payload as { renderType: string; input: unknown; themeConfig?: unknown });
          break;

        case 'GET_CONFIG':
          response = this._getConfiguration();
          break;

        case 'READY':
          // Webview is ready, send initial content
          if (this._document) {
            this.updateContent(this._document.getText());
          }
          response = { success: true };
          break;

        case 'HEADINGS_UPDATED':
          // Headings extracted during rendering - no action needed
          break;

        case 'RENDER_PROGRESS':
          // Rendering progress update - no action needed
          break;

        case 'RENDER_COMPLETE':
          // Rendering completed - no action needed
          break;

        default:
          console.warn(`Unknown message type: ${type}`);
          response = null;
      }

      // Send response using unified ResponseEnvelope format
      if (requestId) {
        this._panel.webview.postMessage({
          type: 'RESPONSE',
          requestId,
          ok: true,
          data: response
        });
      }
    } catch (error) {
      if (requestId) {
        this._panel.webview.postMessage({
          type: 'RESPONSE',
          requestId,
          ok: false,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    }
  }

  private async _handleStorageGet(payload: { keys: string | string[] }): Promise<Record<string, unknown>> {
    const config = vscode.workspace.getConfiguration('markdownViewer');
    const result: Record<string, unknown> = {};
    const keys = Array.isArray(payload.keys) ? payload.keys : [payload.keys];
    
    for (const key of keys) {
      result[key] = config.get(key);
    }
    
    return result;
  }

  private async _handleStorageSet(payload: { items: Record<string, unknown> }): Promise<void> {
    const config = vscode.workspace.getConfiguration('markdownViewer');
    for (const [key, value] of Object.entries(payload.items)) {
      await config.update(key, value, vscode.ConfigurationTarget.Global);
    }
  }

  private async _handleStorageRemove(payload: { keys: string | string[] }): Promise<void> {
    const config = vscode.workspace.getConfiguration('markdownViewer');
    const keys = Array.isArray(payload.keys) ? payload.keys : [payload.keys];
    
    for (const key of keys) {
      await config.update(key, undefined, vscode.ConfigurationTarget.Global);
    }
  }

  // Unified cache operation handler (same interface as Chrome/Mobile)
  private async _handleCacheOperation(payload: {
    operation: 'get' | 'set' | 'delete' | 'clear' | 'getStats';
    key?: string;
    value?: unknown;
    dataType?: string;
  }): Promise<unknown> {
    const { operation, key, value, dataType } = payload;

    switch (operation) {
      case 'get':
        return key ? this._cacheService.get(key) : null;

      case 'set':
        if (!key) return { success: false };
        const setResult = await this._cacheService.set(key, value, dataType);
        return { success: setResult };

      case 'delete':
        if (!key) return { success: false };
        const deleteResult = await this._cacheService.delete(key);
        return { success: deleteResult };

      case 'clear':
        const clearResult = await this._cacheService.clear();
        return { success: clearResult };

      case 'getStats':
        return this._cacheService.getStats();

      default:
        return null;
    }
  }

  private async _handleDownload(payload: { filename: string; data: string; mimeType: string }): Promise<void> {
    const { filename, data, mimeType } = payload;
    
    // Ask user for save location
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(filename),
      filters: {
        'All Files': ['*']
      }
    });

    if (uri) {
      // Decode base64 and write file
      const buffer = Buffer.from(data, 'base64');
      await vscode.workspace.fs.writeFile(uri, buffer);
      vscode.window.showInformationMessage(`File saved: ${uri.fsPath}`);
    }
  }

  private async _handleUploadOperation(payload: {
    operation: string;
    token?: string;
    chunk?: string;
    purpose?: string;
    encoding?: string;
    expectedSize?: number;
    chunkSize?: number;
    metadata?: Record<string, unknown>;
  }): Promise<unknown> {
    const { operation } = payload;

    switch (operation) {
      case 'init': {
        const token = `${Date.now()}-${this._uploadSessions.size}`;
        const chunkSize = payload.chunkSize || 255 * 1024;
        
        this._uploadSessions.set(token, {
          purpose: payload.purpose || 'general',
          encoding: payload.encoding || 'text',
          expectedSize: payload.expectedSize,
          chunkSize,
          metadata: payload.metadata || {},
          chunks: [],
          data: '',
          completed: false,
        });

        return { token, chunkSize };
      }

      case 'chunk': {
        const { token, chunk } = payload;
        if (!token || !chunk) {
          throw new Error('Invalid chunk payload');
        }

        const session = this._uploadSessions.get(token);
        if (!session) {
          throw new Error('Upload session not found');
        }

        session.chunks.push(chunk);
        return {};
      }

      case 'finalize': {
        const { token } = payload;
        if (!token) {
          throw new Error('Missing token');
        }

        const session = this._uploadSessions.get(token);
        if (!session) {
          throw new Error('Upload session not found');
        }

        session.data = session.chunks.join('');
        session.completed = true;

        return {
          token,
          purpose: session.purpose,
          bytes: session.data.length,
          encoding: session.encoding,
        };
      }

      case 'abort': {
        const { token } = payload;
        if (token) {
          this._uploadSessions.delete(token);
        }
        return {};
      }

      default:
        throw new Error(`Unknown upload operation: ${operation}`);
    }
  }

  private async _handleDocxDownloadFinalize(payload: { token: string }): Promise<unknown> {
    const { token } = payload;
    
    if (!token) {
      throw new Error('Missing token');
    }

    const session = this._uploadSessions.get(token);
    if (!session) {
      throw new Error('Upload session not found');
    }

    if (!session.completed) {
      throw new Error('Upload not finalized');
    }

    const filename = (session.metadata.filename as string) || 'document.docx';
    
    // Ask user for save location
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(filename),
      filters: {
        'Word Documents': ['docx'],
        'All Files': ['*']
      }
    });

    if (uri) {
      // Decode base64 and write file
      const buffer = Buffer.from(session.data, 'base64');
      await vscode.workspace.fs.writeFile(uri, buffer);
      vscode.window.showInformationMessage(`File saved: ${uri.fsPath}`);
    }

    // Clean up session
    this._uploadSessions.delete(token);

    return { success: true };
  }

  private async _handleFetchAsset(payload: { path: string }): Promise<string> {
    // Extract relative path from full URL if needed
    let relativePath = payload.path;
    
    // Handle VSCode resource URLs (https://file+.vscode-resource.vscode-cdn.net/...)
    if (relativePath.includes('vscode-resource') || relativePath.includes('vscode-webview')) {
      const webviewIndex = relativePath.indexOf('/webview/');
      if (webviewIndex !== -1) {
        relativePath = relativePath.slice(webviewIndex + '/webview/'.length);
      }
    }
    
    // Handle URL-encoded characters
    try {
      relativePath = decodeURIComponent(relativePath);
    } catch {
      // Ignore decode errors
    }
    
    // When packaged, _extensionUri points to dist/vscode, so webview assets are at webview/
    const assetPath = vscode.Uri.joinPath(this._extensionUri, 'webview', relativePath);
    try {
      const data = await vscode.workspace.fs.readFile(assetPath);
      return Buffer.from(data).toString('utf8');
    } catch (error) {
      console.error(`[PreviewPanel] Failed to fetch asset: ${relativePath} (original: ${payload.path})`, error);
      throw error;
    }
  }

  private async _handleRenderDiagram(payload: { renderType: string; input: unknown; themeConfig?: unknown }): Promise<unknown> {
    // For now, pass through to webview's internal renderer
    // In a full implementation, this could use a worker or separate process
    return {
      error: 'Server-side rendering not implemented. Please use client-side rendering.'
    };
  }

  private _getConfiguration(): Record<string, unknown> {
    const config = vscode.workspace.getConfiguration('markdownViewer');
    return {
      theme: config.get('theme', 'default'),
      fontSize: config.get('fontSize', 16),
      fontFamily: config.get('fontFamily', ''),
      lineNumbers: config.get('lineNumbers', true),
      scrollSync: config.get('scrollSync', true)
    };
  }

  private _update(): void {
    const webview = this._panel.webview;
    
    if (this._document) {
      this._panel.title = `Preview: ${path.basename(this._document.fileName)}`;
    }

    webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get URIs for webview resources
    // Note: When packaged, the extension root IS dist/vscode, so paths are relative to that
    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'webview')
    );
    
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'webview', 'bundle.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'webview', 'styles.css')
    );

    const nonce = getNonce();
    const config = this._getConfiguration();

    // Get toolbar CSS URI
    const toolbarStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'webview', 'toolbar.css')
    );

    // CSP needs to allow iframe for diagram rendering
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; img-src ${webview.cspSource} data: https: blob:; font-src ${webview.cspSource} data:; frame-src ${webview.cspSource} blob:; connect-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <link rel="stylesheet" href="${toolbarStyleUri}">
  <title>Markdown Preview</title>
  <style>
    /* Hide Chrome extension specific UI elements */
    #toolbar,
    #table-of-contents,
    #toc-overlay {
      display: none !important;
    }
    
    /* VS Code webview layout */
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    
    #vscode-root {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    
    #vscode-content {
      flex: 1;
      overflow: auto;
    }
    
    /* Reset wrapper for VS Code (no sidebar offset) */
    #markdown-wrapper {
      margin-left: 0 !important;
      margin-top: 0 !important;
    }
    
    /* Full width content for VS Code */
    #markdown-page {
      max-width: none !important;
    }
  </style>
</head>
<body>
  <div id="vscode-root">
    <div id="vscode-toolbar"></div>
    <div id="vscode-content">
      <div id="markdown-wrapper">
        <div id="markdown-page">
          <div id="markdown-content"></div>
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    // Remove VSCode default styles to prevent style conflicts
    document.getElementById('_defaultStyles')?.remove();
    window.VSCODE_WEBVIEW_BASE_URI = '${webviewUri}';
    window.VSCODE_CONFIG = ${JSON.stringify(config)};
    window.VSCODE_NONCE = '${nonce}';
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    MarkdownPreviewPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/** Upload session for chunked file uploads */
interface UploadSession {
  purpose: string;
  encoding: string;
  expectedSize?: number;
  chunkSize: number;
  metadata: Record<string, unknown>;
  chunks: string[];
  data: string;
  completed: boolean;
}
