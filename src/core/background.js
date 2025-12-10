// Background script for handling messages between content script and offscreen document
import ExtensionCacheManager from '../utils/cache-manager.js';

let offscreenCreated = false;
let globalCacheManager = null;

// Upload sessions in memory
const uploadSessions = new Map();
const DEFAULT_UPLOAD_CHUNK_SIZE = 255 * 1024;

// File states storage key
const FILE_STATES_STORAGE_KEY = 'markdownFileStates';
const FILE_STATE_MAX_AGE_DAYS = 7; // Keep file states for 7 days

// Helper functions for persistent file state management
async function getFileState(url) {
  try {
    const result = await chrome.storage.local.get([FILE_STATES_STORAGE_KEY]);
    let allStates = result[FILE_STATES_STORAGE_KEY] || {};

    // Clean up old states while we're here
    const maxAge = FILE_STATE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let needsCleanup = false;

    const cleanedStates = {};
    for (const [stateUrl, state] of Object.entries(allStates)) {
      const age = now - (state.lastModified || 0);
      if (age < maxAge) {
        cleanedStates[stateUrl] = state;
      } else {
        needsCleanup = true;
      }
    }

    // Update storage if we cleaned anything
    if (needsCleanup) {
      await chrome.storage.local.set({ [FILE_STATES_STORAGE_KEY]: cleanedStates });
      allStates = cleanedStates;
    }

    return allStates[url] || {};
  } catch (error) {
    console.error('[Background] Failed to get file state:', error);
    return {};
  }
}

async function saveFileState(url, state) {
  try {
    const result = await chrome.storage.local.get([FILE_STATES_STORAGE_KEY]);
    const allStates = result[FILE_STATES_STORAGE_KEY] || {};

    // Merge with existing state
    allStates[url] = {
      ...(allStates[url] || {}),
      ...state,
      lastModified: Date.now()
    };

    await chrome.storage.local.set({ [FILE_STATES_STORAGE_KEY]: allStates });
    return true;
  } catch (error) {
    console.error('[Background] Failed to save file state:', error);
    return false;
  }
}

async function clearFileState(url) {
  try {
    const result = await chrome.storage.local.get([FILE_STATES_STORAGE_KEY]);
    const allStates = result[FILE_STATES_STORAGE_KEY] || {};

    delete allStates[url];

    await chrome.storage.local.set({ [FILE_STATES_STORAGE_KEY]: allStates });
    return true;
  } catch (error) {
    console.error('Failed to clear file state:', error);
    return false;
  }
}

// Initialize the global cache manager with user settings
async function initGlobalCacheManager() {
  try {
    // Load user settings to get maxCacheItems
    const result = await chrome.storage.local.get(['markdownViewerSettings']);
    const settings = result.markdownViewerSettings || {};
    const maxCacheItems = settings.maxCacheItems || 1000;

    globalCacheManager = new ExtensionCacheManager(maxCacheItems);
    await globalCacheManager.initDB();
    return globalCacheManager;
  } catch (error) {
    return null;
  }
}

// Initialize cache manager when background script loads
initGlobalCacheManager();

// Monitor offscreen document lifecycle
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'offscreen') {
    port.onDisconnect.addListener(() => {
      // Reset state when offscreen document disconnects
      offscreenCreated = false;
    });
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'offscreenReady') {
    offscreenCreated = true;
    return;
  }

  if (message.type === 'offscreenDOMReady') {
    return;
  }

  if (message.type === 'offscreenError') {
    console.error('Offscreen error:', message.error);
    return;
  }

  if (message.type === 'injectContentScript') {
    handleContentScriptInjection(sender.tab.id, sendResponse);
    return true; // Keep message channel open for async response
  }

  // Handle file state management
  if (message.type === 'saveFileState') {
    saveFileState(message.url, message.state).then(success => {
      sendResponse({ success });
    });
    return true; // Keep message channel open for async response
  }

  if (message.type === 'getFileState') {
    getFileState(message.url).then(state => {
      sendResponse({ state });
    });
    return true; // Keep message channel open for async response
  }

  if (message.type === 'clearFileState') {
    clearFileState(message.url).then(success => {
      sendResponse({ success });
    });
    return true; // Keep message channel open for async response
  }

  // Legacy scroll position management (for backward compatibility)
  if (message.type === 'saveScrollPosition') {
    saveFileState(message.url, { scrollPosition: message.position }).then(success => {
      sendResponse({ success });
    });
    return true; // Keep message channel open for async response
  }

  if (message.type === 'getScrollPosition') {
    getFileState(message.url).then(state => {
      const position = state.scrollPosition || 0;
      sendResponse({ position });
    });
    return true; // Keep message channel open for async response
  }

  if (message.type === 'clearScrollPosition') {
    getFileState(message.url).then(async (currentState) => {
      if (currentState.scrollPosition !== undefined) {
        delete currentState.scrollPosition;
        if (Object.keys(currentState).length === 0) {
          await clearFileState(message.url);
        } else {
          await saveFileState(message.url, currentState);
        }
      }
      sendResponse({ success: true });
    });
    return true; // Keep message channel open for async response
  }

  // Handle cache operations
  if (message.action === 'getCacheStats' || message.action === 'clearCache') {
    handleCacheRequest(message, sendResponse);
    return true; // Keep message channel open for async response
  }

  // Handle cache operations for content scripts
  if (message.type === 'cacheOperation') {
    handleContentCacheOperation(message, sendResponse);
    return true; // Keep message channel open for async response
  }

  // Forward unified rendering messages to offscreen document
  if (message.action === 'RENDER_DIAGRAM' || message.action === 'RENDER_MARKDOWN_TO_IMAGE') {
    handleRenderingRequest(message, sendResponse);
    return true; // Keep message channel open for async response
  }

  // Handle local file reading
  if (message.type === 'READ_LOCAL_FILE') {
    handleFileRead(message, sendResponse);
    return true; // Keep message channel open for async response
  }

  if (message.type === 'UPLOAD_INIT') {
    handleUploadInit(message, sendResponse);
    return;
  }

  if (message.type === 'UPLOAD_CHUNK') {
    handleUploadChunk(message, sendResponse);
    return;
  }

  if (message.type === 'UPLOAD_FINALIZE') {
    handleUploadFinalize(message, sendResponse);
    return;
  }

  if (message.type === 'UPLOAD_ABORT') {
    handleUploadAbort(message);
    return;
  }
  if (message.type === 'DOCX_DOWNLOAD_FINALIZE') {
    return handleDocxDownloadFinalize(message, sendResponse);
  }

  // Note: downloadImage is now handled inside handleRenderingRequest for RENDER_MARKDOWN_TO_IMAGE
});

// Remove the tabs.onRemoved listener since we no longer manage tabs

function createToken() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const buffer = new Uint32Array(4);
  if (globalThis.crypto && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }
  return Array.from(buffer, (value) => value.toString(16).padStart(8, '0')).join('-');
}

async function handleContentCacheOperation(message, sendResponse) {
  try {
    // Ensure global cache manager is initialized
    if (!globalCacheManager) {
      globalCacheManager = await initGlobalCacheManager();
    }

    if (!globalCacheManager) {
      sendResponse({ error: 'Cache system initialization failed' });
      return;
    }

    switch (message.operation) {
      case 'get':
        const item = await globalCacheManager.get(message.key);
        sendResponse({ result: item });
        break;

      case 'set':
        await globalCacheManager.set(message.key, message.value, message.dataType);
        sendResponse({ success: true });
        break;

      case 'clear':
        await globalCacheManager.clear();
        sendResponse({ success: true });
        break;

      case 'getStats':
        const stats = await globalCacheManager.getStats(message.limit || 50);
        sendResponse({ result: stats });
        break;

      default:
        sendResponse({ error: 'Unknown cache operation' });
    }

  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleCacheRequest(message, sendResponse) {
  try {
    // Ensure global cache manager is initialized
    if (!globalCacheManager) {
      globalCacheManager = await initGlobalCacheManager();
    }

    if (!globalCacheManager) {
      sendResponse({
        itemCount: 0,
        maxItems: 1000,
        totalSize: 0,
        totalSizeMB: '0.00',
        items: [],
        message: 'Cache system initialization failed'
      });
      return;
    }

    if (message.action === 'getCacheStats') {
      const limit = message.limit || 50;
      const stats = await globalCacheManager.getStats(limit);
      sendResponse(stats);
    } else if (message.action === 'clearCache') {
      await globalCacheManager.clear();
      sendResponse({ success: true, message: 'Cache cleared successfully' });
    } else {
      sendResponse({ error: 'Unknown cache action' });
    }

  } catch (error) {
    sendResponse({
      error: error.message,
      itemCount: 0,
      maxItems: 1000,
      totalSize: 0,
      totalSizeMB: '0.00',
      items: [],
      message: 'Cache operation failed'
    });
  }
}

async function handleFileRead(message, sendResponse) {
  try {
    // Use fetch to read the file - this should work from background script
    const response = await fetch(message.filePath);

    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.status} ${response.statusText}`);
    }

    // Get content type from response headers
    const contentType = response.headers.get('content-type') || '';

    // Check if binary mode is requested
    if (message.binary) {
      // Read as ArrayBuffer for binary files (images)
      const arrayBuffer = await response.arrayBuffer();
      // Convert to base64 for transmission
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      sendResponse({
        content: base64,
        contentType: contentType
      });
    } else {
      // Read as text for text files
      const content = await response.text();
      sendResponse({ content });
    }
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleRenderingRequest(message, sendResponse) {
  try {
    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    // Send message to offscreen document and wait for response
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          // Don't immediately reset on communication failure - it might be temporary
          // Only reset if the error suggests the document is gone
          if (chrome.runtime.lastError.message.includes('receiving end does not exist')) {
            offscreenCreated = false;
          }
          reject(new Error(`Offscreen communication failed: ${chrome.runtime.lastError.message}`));
        } else if (!response) {
          reject(new Error('No response from offscreen document. Document may have failed to load.'));
        } else {
          resolve(response);
        }
      });
    });

    // Handle download for RENDER_MARKDOWN_TO_IMAGE action
    if (message.action === 'RENDER_MARKDOWN_TO_IMAGE' && response.success && response.dataUrl) {
      // Use full path with subfolder to ensure Chrome respects the filename
      const downloadFilename = `AI_Export/${response.filename || 'ai-response.png'}`;
      console.log('[MD Viewer Background] Downloading with filename:', downloadFilename);

      chrome.downloads.download({
        url: response.dataUrl,
        filename: downloadFilename,
        saveAs: false,
        conflictAction: 'uniquify'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('[MD Viewer Background] Download failed:', chrome.runtime.lastError);
        } else {
          console.log('[MD Viewer Background] Download started with ID:', downloadId);
        }
      });
    }

    sendResponse(response);

  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function ensureOffscreenDocument() {
  // If already created, return immediately
  if (offscreenCreated) {
    return;
  }

  // Try to create offscreen document
  // Multiple concurrent requests might try to create, but that's OK
  try {
    const offscreenUrl = chrome.runtime.getURL('ui/offscreen.html');

    await chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: ['DOM_SCRAPING'],
      justification: 'Render diagrams and charts to PNG images'
    });

    offscreenCreated = true;

  } catch (error) {
    // If error is about document already existing, that's fine
    if (error.message.includes('already exists') || error.message.includes('Only a single offscreen')) {
      offscreenCreated = true;
      return;
    }

    // For other errors, throw them
    throw new Error(`Failed to create offscreen document: ${error.message}`);
  }
}

// Handle dynamic content script injection
async function handleContentScriptInjection(tabId, sendResponse) {
  try {
    // Inject CSS first
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ['ui/styles.css']
    });

    // Then inject JavaScript
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['core/content.js']
    });

    sendResponse({ success: true });

  } catch (error) {
    sendResponse({ error: error.message });
  }
}

function initUploadSession(purpose, options = {}) {
  const {
    chunkSize = DEFAULT_UPLOAD_CHUNK_SIZE,
    encoding = 'text',
    metadata = {},
    expectedSize = null
  } = options;

  const token = createToken();
  uploadSessions.set(token, {
    purpose,
    encoding,
    metadata,
    expectedSize,
    chunkSize,
    chunks: [],
    receivedBytes: 0,
    createdAt: Date.now(),
    completed: false
  });

  return { token, chunkSize };
}

function appendUploadChunk(token, chunk) {
  const session = uploadSessions.get(token);
  if (!session || session.completed) {
    throw new Error('Upload session not found');
  }

  if (typeof chunk !== 'string') {
    throw new Error('Invalid chunk payload');
  }

  if (!Array.isArray(session.chunks)) {
    session.chunks = [];
  }

  session.chunks.push(chunk);

  if (session.encoding === 'base64') {
    session.receivedBytes = (session.receivedBytes || 0) + Math.floor(chunk.length * 3 / 4);
  } else {
    session.receivedBytes = (session.receivedBytes || 0) + chunk.length;
  }

  session.lastChunkTime = Date.now();
}

function finalizeUploadSession(token) {
  const session = uploadSessions.get(token);
  if (!session || session.completed) {
    throw new Error('Upload session not found');
  }

  const chunks = Array.isArray(session.chunks) ? session.chunks : [];
  const combined = chunks.join('');

  session.data = combined;
  session.chunks = null;
  session.completed = true;
  session.completedAt = Date.now();

  return session;
}

function abortUploadSession(token) {
  if (token && uploadSessions.has(token)) {
    uploadSessions.delete(token);
  }
}

function handleUploadInit(message, sendResponse) {
  const payload = message?.payload || {};
  const purpose = typeof payload.purpose === 'string' && payload.purpose.trim()
    ? payload.purpose.trim()
    : 'general';
  const encoding = payload.encoding === 'base64' ? 'base64' : 'text';
  const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
  const expectedSize = typeof payload.expectedSize === 'number' ? payload.expectedSize : null;
  const requestedChunkSize = typeof payload.chunkSize === 'number' && payload.chunkSize > 0
    ? payload.chunkSize
    : DEFAULT_UPLOAD_CHUNK_SIZE;

  try {
    const { token, chunkSize } = initUploadSession(purpose, {
      chunkSize: requestedChunkSize,
      encoding,
      expectedSize,
      metadata
    });

    sendResponse({ success: true, token, chunkSize });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

function handleUploadChunk(message, sendResponse) {
  const token = message?.token;
  const chunk = typeof message?.chunk === 'string' ? message.chunk : null;

  if (!token || chunk === null) {
    sendResponse({ error: 'Invalid upload chunk payload' });
    return;
  }

  try {
    appendUploadChunk(token, chunk);
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

function handleUploadFinalize(message, sendResponse) {
  const token = message?.token;
  if (!token) {
    sendResponse({ error: 'Missing upload session token' });
    return;
  }

  try {
    const session = finalizeUploadSession(token);
    sendResponse({
      success: true,
      token,
      purpose: session.purpose,
      bytes: session.receivedBytes,
      encoding: session.encoding
    });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

function handleUploadAbort(message) {
  const token = message?.token;
  abortUploadSession(token);
}

function handleDocxDownloadFinalize(message, sendResponse) {
  const token = message?.token;
  if (!token) {
    sendResponse({ error: 'Missing download job token' });
    return false;
  }

  try {
    let session = uploadSessions.get(token);
    if (!session) {
      sendResponse({ error: 'Download job not found' });
      return false;
    }

    if (!session.completed) {
      session = finalizeUploadSession(token);
    }

    const { metadata = {}, data = '' } = session;
    const filename = metadata.filename || 'document.docx';
    const mimeType = metadata.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const dataUrl = `data:${mimeType};base64,${data}`;
    chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    uploadSessions.delete(token);
    return true;
  } catch (error) {
    sendResponse({ error: error.message });
    return false;
  }
}

// Listen for settings changes to update cache manager
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.markdownViewerSettings) {
    const newSettings = changes.markdownViewerSettings.newValue;
    if (newSettings && newSettings.maxCacheItems) {
      const newMaxItems = newSettings.maxCacheItems;

      // Update global cache manager's maxItems
      if (globalCacheManager) {
        globalCacheManager.maxItems = newMaxItems;
        console.log('[Background] Cache maxItems updated to:', newMaxItems);
      }
    }
  }
});