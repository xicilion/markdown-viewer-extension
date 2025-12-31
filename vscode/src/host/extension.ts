/**
 * VS Code Extension Entry Point
 * 
 * Main entry point for the Markdown Viewer extension.
 */

import * as vscode from 'vscode';
import { MarkdownPreviewPanel } from './preview-panel';
import { ExtensionCacheService } from './cache-service';

let outputChannel: vscode.OutputChannel;
let cacheService: ExtensionCacheService;
let renderStatusBarItem: vscode.StatusBarItem;
let renderStatusTimeout: ReturnType<typeof setTimeout> | null = null;

// Debounce timer for document changes
let updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const UPDATE_DEBOUNCE_MS = 300;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Markdown Viewer');
  outputChannel.appendLine('Markdown Viewer is now active');

  // Initialize cache service
  cacheService = new ExtensionCacheService(context);
  cacheService.init().catch(err => {
    outputChannel.appendLine(`Cache service init error: ${err}`);
  });

  // Create status bar item for render progress
  renderStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(renderStatusBarItem);

  // Helper to update render progress in status bar
  const updateRenderProgress = (completed: number, total: number) => {
    if (renderStatusTimeout) {
      clearTimeout(renderStatusTimeout);
      renderStatusTimeout = null;
    }
    
    if (total > 0 && completed < total) {
      renderStatusBarItem.text = `$(sync~spin) Rendering ${completed}/${total}`;
      renderStatusBarItem.show();
    } else {
      renderStatusBarItem.text = `$(check) Render complete`;
      renderStatusBarItem.show();
      // Hide after 2 seconds
      renderStatusTimeout = setTimeout(() => {
        renderStatusBarItem.hide();
        renderStatusTimeout = null;
      }, 2000);
    }
  };

  // Register preview command
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownViewer.preview', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        const panel = MarkdownPreviewPanel.createOrShow(context.extensionUri, editor.document, cacheService);
        panel.setRenderProgressCallback(updateRenderProgress);
      } else {
        vscode.window.showWarningMessage('Please open a Markdown file first');
      }
    })
  );

  // Register preview to side command
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownViewer.previewToSide', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        const panel = MarkdownPreviewPanel.createOrShow(context.extensionUri, editor.document, cacheService, vscode.ViewColumn.Beside);
        panel.setRenderProgressCallback(updateRenderProgress);
      } else {
        vscode.window.showWarningMessage('Please open a Markdown file first');
      }
    })
  );

  // Register export to DOCX command
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownViewer.exportDocx', async () => {
      const panel = MarkdownPreviewPanel.currentPanel;
      if (panel) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Exporting to DOCX',
            cancellable: false,
          },
          async (progress) => {
            let lastProgress = 0;
            const success = await panel.exportToDocx((percent) => {
              const increment = percent - lastProgress;
              if (increment > 0) {
                progress.report({ increment, message: `${percent}%` });
                lastProgress = percent;
              }
            });
            if (!success) {
              vscode.window.showErrorMessage('DOCX export failed');
            }
          }
        );
      } else {
        vscode.window.showWarningMessage('Please open the Markdown preview first');
      }
    })
  );

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownViewer.refresh', () => {
      const panel = MarkdownPreviewPanel.currentPanel;
      if (panel) {
        panel.refresh();
      }
    })
  );

  // Register open settings command
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownViewer.openSettings', () => {
      const panel = MarkdownPreviewPanel.currentPanel;
      if (panel) {
        panel.openSettings();
      }
    })
  );

  // Auto-update preview on document change (with debounce)
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === 'markdown') {
        const panel = MarkdownPreviewPanel.currentPanel;
        if (panel && panel.isDocumentMatch(e.document)) {
          // Debounce updates to avoid excessive re-renders during typing
          if (updateDebounceTimer) {
            clearTimeout(updateDebounceTimer);
          }
          updateDebounceTimer = setTimeout(() => {
            updateDebounceTimer = null;
            panel.updateContent(e.document.getText());
          }, UPDATE_DEBOUNCE_MS);
        }
      }
    })
  );

  // Auto-update preview on active editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === 'markdown') {
        const panel = MarkdownPreviewPanel.currentPanel;
        if (panel) {
          panel.setDocument(editor.document);
        }
      }
    })
  );

  // Scroll sync: Editor → Preview (when editor visible range changes)
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      if (event.textEditor.document.languageId === 'markdown') {
        const panel = MarkdownPreviewPanel.currentPanel;
        if (panel && panel.isDocumentMatch(event.textEditor.document)) {
          // Get the topmost visible line
          const visibleRanges = event.visibleRanges;
          if (visibleRanges.length > 0) {
            const topLine = visibleRanges[0].start.line;
            panel.scrollToLine(topLine);
          }
        }
      }
    })
  );

  outputChannel.appendLine('Commands registered successfully');
}

export function deactivate() {
  if (renderStatusTimeout) {
    clearTimeout(renderStatusTimeout);
  }
  if (outputChannel) {
    outputChannel.dispose();
  }
}
