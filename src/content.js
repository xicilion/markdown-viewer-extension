// Markdown Viewer Content Script using unified + rehypeKatex + Extension Renderer
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import ExtensionRenderer from './renderer.js';
import ExtensionCacheManager from './cache-manager.js';

// Background Cache Proxy for Content Scripts
class BackgroundCacheManagerProxy {
  constructor() {
    this.dbName = 'MarkdownViewerCache';
    this.storeName = 'cache';
    this.dbVersion = 1;
  }

  async get(key) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'cacheOperation',
        operation: 'get',
        key: key
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.result;
    } catch (error) {
      return null;
    }
  }

  async set(key, value, type = 'unknown') {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'cacheOperation',
        operation: 'set',
        key: key,
        value: value,
        dataType: type
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.success;
    } catch (error) {
      return false;
    }
  }

  async clear() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'cacheOperation',
        operation: 'clear'
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.success;
    } catch (error) {
      return false;
    }
  }

  async getStats() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'cacheOperation',
        operation: 'getStats'
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.result;
    } catch (error) {
      return null;
    }
  }

  // No need for initDB since background handles it
  async initDB() {
    return Promise.resolve();
  }

  async calculateHash(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async generateKey(content, type) {
    const hash = await this.calculateHash(content);
    return `${hash}_${type}`;
  }
}

/**
 * Restore scroll position after rendering
 * @param {number} scrollPosition - The saved scroll position to restore
 */
function restoreScrollPosition(scrollPosition) {
  // Function to perform the scroll restoration
  const performScroll = () => {
    window.scrollTo(0, scrollPosition);
    const currentPosition = window.scrollY || window.pageYOffset;

    // Clear saved scroll position from background script after restoration
    chrome.runtime.sendMessage({
      type: 'clearScrollPosition',
      url: document.location.href
    });

    // If the position wasn't set correctly (and it's not supposed to be at top), try again after a short delay
    if (scrollPosition > 0 && Math.abs(currentPosition - scrollPosition) > 10) {
      setTimeout(() => {
        window.scrollTo(0, scrollPosition);
      }, 100);
    }
  };

  // Use requestAnimationFrame to ensure DOM is fully rendered
  requestAnimationFrame(() => {
    // For non-zero positions, wait for images to load to ensure accurate positioning
    if (scrollPosition > 0) {
      // Check if there are images that might still be loading
      const images = document.querySelectorAll('#markdown-content img');
      const imagePromises = Array.from(images).map(img => {
        if (img.complete) {
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          img.addEventListener('load', resolve);
          img.addEventListener('error', resolve); // Resolve even on error
          // Timeout after 3 seconds to prevent infinite waiting
          setTimeout(resolve, 3000);
        });
      });

      if (imagePromises.length > 0) {
        Promise.all(imagePromises).then(() => {
          performScroll();
        });
      } else {
        performScroll();
      }
    } else {
      // For position 0 (page top), scroll immediately without waiting for images
      performScroll();
    }
  });
}

/**
 * Normalize list markers in markdown text
 * Converts non-standard list markers to standard ones
 * @param {string} markdown - Raw markdown content
 * @returns {string} Normalized markdown
 */
function normalizeListMarkers(markdown) {
  // Convert bullet points (•) to standard dashes
  // Handle Tab + bullet + Tab pattern (common in some editors)
  let normalized = markdown.replace(/^(\s*)\t*[•◦▪▫]\t*\s*/gm, '$1- ');

  // Convert other common bullet symbols with various whitespace patterns
  normalized = normalized.replace(/^(\s*)\t*[▸▹►▷]\t*\s*/gm, '$1- ');

  // Handle cases where there are only tabs (convert to 2 spaces per tab for proper indentation)
  normalized = normalized.replace(/^(\t+)/gm, (match, tabs) => {
    return '  '.repeat(tabs.length);
  });

  // Convert numbered lists with various number formats
  normalized = normalized.replace(/^(\s*)([①②③④⑤⑥⑦⑧⑨⑩])\s+/gm, '$1$2. ');

  return normalized;
}

/**
 * Normalize math blocks in markdown text
 * Converts single-line $$...$$ to multi-line format for proper display math rendering
 * @param {string} markdown - Raw markdown content
 * @returns {string} Normalized markdown
 */
function normalizeMathBlocks(markdown) {
  // Match single-line display math blocks: $$...$$ (not starting/ending with $$$$)
  // Pattern explanation:
  // - (?<!\$\$) - not preceded by $$
  // - \$\$ - opening $$
  // - (.+?) - formula content (non-greedy)
  // - \$\$ - closing $$
  // - (?!\$\$) - not followed by $$
  const singleLineMathRegex = /^(\s*)(?<!\$\$)\$\$(.+?)\$\$(?!\$\$)\s*$/gm;
  
  let mathBlocksFound = 0;
  
  // Replace single-line math blocks with multi-line format
  const normalized = markdown.replace(singleLineMathRegex, (match, indent, formula) => {
    mathBlocksFound++;
    // Convert to multi-line format with proper spacing
    return `\n$$\n${formula.trim()}\n$$\n`;
  });
  
  return normalized;
}

// Global async task queue
const asyncTaskQueue = [];
let asyncTaskIdCounter = 0;

/**
 * Generate unique ID for async tasks
 */
function generateAsyncId() {
  return `async-placeholder-${++asyncTaskIdCounter}`;
}

/**
 * Register async task for later execution
 * @param {Function} callback - The async callback function
 * @param {Object} data - Data to pass to callback
 * @param {string} type - Type for placeholder styling ('mermaid', 'html', 'svg')
 * @param {string} description - Optional description for placeholder
 * @returns {Object} - HTML node object with placeholder content
 */
function asyncTask(callback, data = {}, type = 'unknown', description = '') {
  const placeholderId = generateAsyncId();
  asyncTaskQueue.push({ callback, data: { ...data, id: placeholderId } });
  
  return {
    type: 'html',
    value: createAsyncPlaceholder(placeholderId, type, description)
  };
}

/**
 * Create placeholder HTML for async content
 */
function createAsyncPlaceholder(id, type, description = '') {
  const typeLabels = {
    'mermaid': 'Mermaid 图表',
    'html': 'HTML 图表', 
    'svg': 'SVG 图像'
  };
  
  return `<div id="${id}" class="async-placeholder ${type}-placeholder">
    <div class="async-loading">
      <div class="async-spinner"></div>
      <div class="async-text">正在处理 ${typeLabels[type] || type}${description ? ': ' + description : ''}...</div>
    </div>
  </div>`;
}

/**
 * Process all async tasks in queue sequentially (one by one)
 */
async function processAsyncTasks() {
  if (asyncTaskQueue.length === 0) {
    console.log('No async tasks to process');
    return;
  }
  
  const totalTasks = asyncTaskQueue.length;
  console.log(`Processing ${totalTasks} async tasks`);
  
  // Show processing indicator and set initial progress (full circle)
  showProcessingIndicator();
  updateProgress(0, totalTasks); // 0 completed out of totalTasks
  
  // Process tasks one by one to avoid offscreen document conflicts
  let completedTasks = 0;
  while (asyncTaskQueue.length > 0) {
    const taskInfo = asyncTaskQueue.shift();
    try {
      if (typeof taskInfo === 'function') {
        // Legacy support for direct function callbacks
        await Promise.resolve().then(taskInfo);
      } else {
        // New format with data
        await Promise.resolve().then(() => taskInfo.callback(taskInfo.data));
      }
      
      // Update progress after each task completion
      completedTasks++;
      updateProgress(completedTasks, totalTasks);
      
    } catch (error) {
      console.error('Async task error:', error);
      // Still count as completed to maintain progress accuracy
      completedTasks++;
      updateProgress(completedTasks, totalTasks);
    }
  }
  
  // Hide processing indicator when all tasks are done
  hideProcessingIndicator();
  console.log('All async tasks completed');
}

/**
 * Update progress circle based on completed vs total tasks
 */
function updateProgress(completed, total) {
  const progressCircle = document.querySelector('.progress-circle-progress');
  if (!progressCircle) return;
  
  // Calculate progress percentage
  const progress = completed / total;
  const circumference = 43.98; // 2 * PI * 7 (radius)
  
  // Calculate stroke-dashoffset (starts at full circle, decreases as progress increases)
  const offset = circumference * (1 - progress);
  
  progressCircle.style.strokeDashoffset = offset;
  
  console.log(`Progress: ${completed}/${total} (${Math.round(progress * 100)}%)`);
}

/**
 * Show processing indicator in TOC header
 */
function showProcessingIndicator() {
  console.log('Attempting to show processing indicator...');
  
  // Debug: check if the elements exist
  const tocDiv = document.getElementById('table-of-contents');
  const tocHeader = document.querySelector('.toc-header');
  const indicator = document.getElementById('processing-indicator');
  
  console.log('TOC div exists:', !!tocDiv);
  console.log('TOC header exists:', !!tocHeader);
  console.log('Processing indicator exists:', !!indicator);
  
  if (tocHeader) {
    console.log('TOC header HTML:', tocHeader.innerHTML);
  }
  
  if (indicator) {
    console.log('Showing processing indicator');
    indicator.classList.remove('hidden');
  } else {
    console.log('Processing indicator element not found');
    // Try to find it by class
    const indicatorByClass = document.querySelector('.processing-indicator');
    console.log('Indicator by class exists:', !!indicatorByClass);
  }
}

/**
 * Hide processing indicator in TOC header
 */
function hideProcessingIndicator() {
  const indicator = document.getElementById('processing-indicator');
  if (indicator) {
    console.log('Hiding processing indicator');
    indicator.classList.add('hidden');
  } else {
    console.log('Processing indicator element not found');
  }
}/**
 * Remark plugin to convert Mermaid code blocks to PNG (async callback version)
 */
function remarkMermaidToPng(renderer) {
  return function() {
    return (tree) => {
      // Collect all mermaid code blocks
      visit(tree, 'code', (node, index, parent) => {
        if (node.lang === 'mermaid') {
          // Replace code block with async task placeholder immediately
          parent.children[index] = asyncTask(async (data) => {
            const { id, code } = data;
            try {
              const pngBase64 = await renderer.renderMermaidToPng(code);
              const placeholder = document.getElementById(id);
              if (placeholder) {
                placeholder.outerHTML = `<div class="mermaid-diagram" style="text-align: center; margin: 20px 0;">
                  <img src="data:image/png;base64,${pngBase64}" alt="Mermaid diagram" style="max-width: 100%; height: auto;" />
                </div>`;
              }
            } catch (error) {
              const placeholder = document.getElementById(id);
              if (placeholder) {
                placeholder.outerHTML = `<pre style="background: #fee; border-left: 4px solid #f00; padding: 10px; font-size: 12px;">Mermaid Error: ${escapeHtml(error.message)}</pre>`;
              }
            }
          }, { code: node.value }, 'mermaid');
        }
      });
    };
  };
}

/**
 * Remark plugin to convert HTML blocks to PNG (async callback version)
 */
function remarkHtmlToPng(renderer) {
  return function() {
    return (tree) => {
      // Collect all significant HTML nodes
      visit(tree, 'html', (node, index, parent) => {
        const htmlContent = node.value.trim();
        
        // Check if it's a significant HTML block
        if ((htmlContent.startsWith('<div') || htmlContent.startsWith('<table') || htmlContent.startsWith('<svg')) && htmlContent.length > 100) {
          // Replace HTML node with async task placeholder immediately
          parent.children[index] = asyncTask(async (data) => {
            const { id, code } = data;
            try {
              const pngBase64 = await renderer.renderHtmlToPng(code);
              const placeholder = document.getElementById(id);
              if (placeholder) {
                placeholder.outerHTML = `<div class="html-diagram" style="text-align: center; margin: 20px 0;">
                  <img src="data:image/png;base64,${pngBase64}" alt="HTML diagram" style="max-width: 100%; height: auto;" />
                </div>`;
              }
            } catch (error) {
              const placeholder = document.getElementById(id);
              if (placeholder) {
                placeholder.outerHTML = `<pre style="background: #fee; border-left: 4px solid #f00; padding: 10px; font-size: 12px;">HTML转换错误: ${escapeHtml(error.message)}</pre>`;
              }
            }
          }, { code: node.value }, 'html');
        }
      });
    };
  };
}

/**
 * Process HTML to convert SVG images to PNG (async callback version)
 */
async function processSvgImages(html, renderer) {
  const imgRegex = /<img\s+[^>]*src="([^"]+\.svg)"[^>]*>/gi;
  const matches = [];
  let match;

  // Collect all SVG image tags
  while ((match = imgRegex.exec(html)) !== null) {
    matches.push({
      fullMatch: match[0],
      src: match[1],
      index: match.index
    });
  }

  if (matches.length === 0) {
    return html;
  }

  // Replace SVG images with async placeholders (process in reverse order to preserve indices)
  for (let i = matches.length - 1; i >= 0; i--) {
    const { fullMatch, src } = matches[i];
    const fileName = src.split('/').pop();
    
    // Create async task manually (since this is in HTML processing, not AST)
    const placeholderId = generateAsyncId();
    asyncTaskQueue.push({ 
      callback: async (data) => {
        const { id, src, originalTag } = data;
        try {
          // Fetch SVG content
          let svgContent;
          if (src.startsWith('http://') || src.startsWith('https://')) {
            const response = await fetch(src);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            svgContent = await response.text();
          } else {
            // For local files, use extension background
            const baseUrl = window.location.href;
            const absoluteUrl = new URL(src, baseUrl).href;
            
            const response = await chrome.runtime.sendMessage({
              type: 'READ_LOCAL_FILE',
              filePath: absoluteUrl
            });
            
            if (response.error) {
              throw new Error(response.error);
            }
            
            svgContent = response.content;
          }
          
          const pngBase64 = await renderer.renderSvgToPng(svgContent);
          const placeholder = document.getElementById(id);
          if (placeholder) {
            const newImgTag = originalTag.replace(/src="[^"]+"/, `src="data:image/png;base64,${pngBase64}"`);
            placeholder.outerHTML = newImgTag;
          }
        } catch (error) {
          const placeholder = document.getElementById(id);
          if (placeholder) {
            placeholder.outerHTML = `<pre style="background: #fee; border-left: 4px solid #f00; padding: 10px; font-size: 12px;">SVG Error: Cannot load file "${escapeHtml(src)}" - ${escapeHtml(error.message)}</pre>`;
          }
        }
      }, 
      data: { id: placeholderId, src: src, originalTag: fullMatch }
    });
    
    // Create placeholder
    const placeholder = createAsyncPlaceholder(placeholderId, 'svg', fileName);
    
    // Replace the image tag with placeholder
    html = html.substring(0, matches[i].index) + placeholder + html.substring(matches[i].index + fullMatch.length);
  }
  
  return html;
}

/**
 * Process tables to add centering attributes for Word compatibility
 * @param {string} html - HTML content
 * @returns {string} HTML with centered tables
 */
function processTablesForWordCompatibility(html) {
  // Wrap tables with centering div and add align attributes (same as convert.js)
  html = html.replace(/<table>/g, '<div align="center"><table align="center">');
  html = html.replace(/<\/table>/g, '</table></div>');

  return html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initialize renderer with background cache proxy
const cacheManager = new BackgroundCacheManagerProxy();
const renderer = new ExtensionRenderer(cacheManager);

// Store renderer globally for debugging and access from other parts
window.extensionRenderer = renderer;

// Listen for cache operations messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle cache operations
  if (message.type === 'getCacheStats') {
    if (window.extensionRenderer && window.extensionRenderer.cacheManager) {
      window.extensionRenderer.cacheManager.getStats()
        .then(stats => {
          sendResponse(stats);
        })
        .catch(error => {
          console.error('Failed to get cache stats:', error);
          sendResponse({ error: error.message });
        });
      return true; // Keep message channel open
    } else {
      sendResponse({
        itemCount: 0,
        maxItems: 1000,
        totalSize: 0,
        totalSizeMB: '0.00',
        items: []
      });
    }
    return;
  }

  if (message.type === 'clearCache') {
    if (window.extensionRenderer && window.extensionRenderer.cacheManager) {
      window.extensionRenderer.cacheManager.clear()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('Failed to clear cache:', error);
          sendResponse({ error: error.message });
        });
      return true; // Keep message channel open
    } else {
      sendResponse({ error: 'No cache manager available' });
    }
    return;
  }
});

// Since this script is only injected when content-detector.js confirms this is a markdown file,
// we can directly proceed with processing
const isRemote = document.location.protocol !== 'file:';

// Get scroll position from background script (avoids sandbox restrictions)
async function getSavedScrollPosition() {
  let currentScrollPosition = 0;

  try {
    currentScrollPosition = window.scrollY || window.pageYOffset || 0;
  } catch (e) {
    console.log('[Markdown Viewer] Window access blocked, using fallback');
  }

  // Get saved scroll position from background script
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getScrollPosition',
      url: document.location.href
    });

    // Return saved position if available and current position is at top (page just loaded)
    if (response && typeof response.position === 'number' && currentScrollPosition === 0) {
      return response.position;
    }
  } catch (e) {
    console.log('[Markdown Viewer] Failed to get saved scroll position');
  }

  return currentScrollPosition;
}

// Get the raw markdown content
const rawMarkdown = document.body.textContent;

// Create a new container for the rendered content
document.body.innerHTML = `
  <div id="table-of-contents">
    <div class="toc-header">
      <span class="toc-title">目录</span>
      <div id="processing-indicator" class="processing-indicator hidden">
        <svg class="progress-circle" width="18" height="18" viewBox="0 0 18 18">
          <circle class="progress-circle-bg" cx="9" cy="9" r="7" stroke="#666" stroke-width="2" fill="none"/>
          <circle class="progress-circle-progress" cx="9" cy="9" r="7" stroke="#00d4aa" stroke-width="2" fill="none"
                  stroke-dasharray="43.98" stroke-dashoffset="43.98" transform="rotate(-90 9 9)"/>
        </svg>
      </div>
    </div>
  </div>
  <div id="toc-overlay" class="hidden"></div>
  <div id="markdown-wrapper">
    <div id="markdown-content"></div>
  </div>
`;

// Wait a bit for DOM to be ready, then start processing
setTimeout(async () => {
  // Get saved scroll position
  const savedScrollPosition = await getSavedScrollPosition();

  // Parse and render markdown
  await renderMarkdown(rawMarkdown, savedScrollPosition);

  // Setup TOC toggle (using keyboard shortcut)
  setupTocToggle();

  // Setup responsive behavior
  setupResponsiveToc();
  
  // Now that all DOM is ready, process async tasks
  // Add a small delay to ensure DOM is fully rendered and visible
  setTimeout(() => {
    console.log('Starting async task processing...');
    processAsyncTasks();
  }, 200);
}, 100);

// Listen for scroll events and save position to background script
let scrollTimeout;
try {
  window.addEventListener('scroll', () => {
    // Debounce scroll saving to avoid too frequent background messages
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      try {
        const currentPosition = window.scrollY || window.pageYOffset;
        // Save position even when it's 0 (page top) to ensure correct restoration
        chrome.runtime.sendMessage({
          type: 'saveScrollPosition',
          url: document.location.href,
          position: currentPosition
        });
      } catch (e) {
        // Ignore errors
      }
    }, 300); // Save position 300ms after user stops scrolling
  });
} catch (e) {
  console.log('[Markdown Viewer] Scroll event listener setup failed, continuing without scroll persistence');
}

async function renderMarkdown(markdown, savedScrollPosition = 0) {
  const contentDiv = document.getElementById('markdown-content');

  if (!contentDiv) {
    console.error('markdown-content div not found!');
    return;
  }

  // Pre-process markdown to normalize math blocks and list markers
  let normalizedMarkdown = normalizeMathBlocks(markdown);
  normalizedMarkdown = normalizeListMarkers(normalizedMarkdown);

  try {
    // Setup markdown processor with async plugins
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkHtmlToPng(renderer)) // Add HTML processing FIRST
      .use(remarkMermaidToPng(renderer)) // Add Mermaid processing AFTER HTML
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeSlug)
      .use(rehypeHighlight) // Add syntax highlighting
      .use(rehypeKatex)
      .use(rehypeStringify, { allowDangerousHtml: true });

    const file = await processor.process(normalizedMarkdown);
    let htmlContent = String(file);

    // Process SVG images (creates placeholders)
    htmlContent = await processSvgImages(htmlContent, renderer);
    
    // Add table centering for better Word compatibility
    htmlContent = processTablesForWordCompatibility(htmlContent);

    contentDiv.innerHTML = htmlContent;
    
    // Generate table of contents after rendering
    generateTOC();

    // Restore scroll position immediately
    restoreScrollPosition(savedScrollPosition);
    
    // Don't process async tasks here - let main flow handle it
  } catch (error) {
    console.error('Markdown processing error:', error);
    console.error('Error stack:', error.stack);
    contentDiv.innerHTML = `<pre style="color: red; background: #fee; padding: 20px;">Error processing markdown: ${error.message}\n\nStack:\n${error.stack}</pre>`;
    restoreScrollPosition(savedScrollPosition);
  }
}

function generateTOC() {
  const contentDiv = document.getElementById('markdown-content');
  const tocDiv = document.getElementById('table-of-contents');

  if (!contentDiv || !tocDiv) return;

  const headings = contentDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');

  if (headings.length === 0) {
    tocDiv.style.display = 'none';
    return;
  }

  // Preserve the existing header structure with processing indicator
  let tocHTML = `
    <div class="toc-header">
      <span class="toc-title">目录</span>
      <div id="processing-indicator" class="processing-indicator hidden">
        <svg class="progress-circle" width="18" height="18" viewBox="0 0 18 18">
          <circle class="progress-circle-bg" cx="9" cy="9" r="7" stroke="#666" stroke-width="2" fill="none"/>
          <circle class="progress-circle-progress" cx="9" cy="9" r="7" stroke="#00d4aa" stroke-width="2" fill="none"
                  stroke-dasharray="43.98" stroke-dashoffset="43.98" transform="rotate(-90 9 9)"/>
        </svg>
      </div>
    </div>
    <ul class="toc-list">`;

  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName[1]);
    const text = heading.textContent;
    const id = heading.id || `heading-${index}`;

    if (!heading.id) {
      heading.id = id;
    }

    const indent = (level - 1) * 20;
    tocHTML += `<li style="margin-left: ${indent}px"><a href="#${id}">${text}</a></li>`;
  });

  tocHTML += '</ul>';
  tocDiv.innerHTML = tocHTML;
}

function setupTocToggle() {
  const tocDiv = document.getElementById('table-of-contents');
  const overlayDiv = document.getElementById('toc-overlay');

  if (!tocDiv || !overlayDiv) return;

  const toggleToc = () => {
    tocDiv.classList.toggle('hidden');
    document.body.classList.toggle('toc-hidden');
    overlayDiv.classList.toggle('hidden');
  };

  // Use keyboard shortcut (Ctrl+B or Cmd+B) to toggle TOC
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      toggleToc();
    }
  });

  // Close TOC when clicking overlay (for mobile)
  overlayDiv.addEventListener('click', toggleToc);
}

function setupResponsiveToc() {
  const tocDiv = document.getElementById('table-of-contents');

  if (!tocDiv) return;

  const handleResize = () => {
    if (window.innerWidth <= 1024) {
      // On smaller screens, hide TOC by default
      tocDiv.classList.add('hidden');
      document.body.classList.add('toc-hidden');
    } else {
      // On larger screens, show TOC by default
      tocDiv.classList.remove('hidden');
      document.body.classList.remove('toc-hidden');
    }
  };

  // Set initial state
  handleResize();

  // Listen for window resize
  window.addEventListener('resize', handleResize);
}
