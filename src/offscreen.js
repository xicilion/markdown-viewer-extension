// Offscreen document script for rendering
import mermaid from 'mermaid';

// Add error listeners for debugging
window.addEventListener('error', (event) => {
  chrome.runtime.sendMessage({
    type: 'offscreenError',
    error: event.error?.message || 'Unknown error',
    filename: event.filename,
    lineno: event.lineno
  }).catch(() => { });
});

window.addEventListener('unhandledrejection', (event) => {
  chrome.runtime.sendMessage({
    type: 'offscreenError',
    error: `Unhandled promise rejection: ${event.reason}`,
    filename: 'Promise',
    lineno: 0
  }).catch(() => { });
});

// Optimize canvas performance on page load
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.style.backgroundColor = 'transparent';
  document.body.style.backgroundColor = 'transparent';

  const canvas = document.getElementById('png-canvas');
  if (canvas) {
    // Pre-initialize context with willReadFrequently for better performance
    canvas.getContext('2d', { willReadFrequently: true });
  }

  // Send ready signal when DOM is loaded
  chrome.runtime.sendMessage({
    type: 'offscreenDOMReady'
  }).catch(() => { });
});

// Import Mermaid dynamically to handle potential import issues
async function initializeMermaid() {
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      lineHeight: 1.6,
      themeVariables: {
        fontFamily: "'SimSun', 'Times New Roman', Times, serif",
        background: 'transparent'
      },
      flowchart: {
        htmlLabels: true,
        curve: 'basis'
      }
    });

    return true;
  } catch (error) {
    return false;
  }
}

// Establish connection with background script for lifecycle monitoring
const port = chrome.runtime.connect({ name: 'offscreen' });

// Initialize Mermaid when script loads
let mermaidReady = false;
initializeMermaid().then(success => {
  mermaidReady = success;

  // Notify background script that offscreen document is ready
  chrome.runtime.sendMessage({
    type: 'offscreenReady',
    mermaidReady: mermaidReady
  }).catch(() => {
    // Ignore errors if background script isn't ready
  });
});

// Message handler for rendering requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'renderMermaid') {
    renderMermaidToPng(message.mermaid).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true; // Keep the message channel open for async response
  } else if (message.type === 'renderHtml') {
    renderHtmlToPng(message.html, message.width).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true;
  } else if (message.type === 'renderSvg') {
    renderSvgToPng(message.svg).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true;
  }
});

// Render Mermaid to PNG
async function renderMermaidToPng(code) {
  try {
    if (!mermaidReady || !mermaid) {
      const initSuccess = await initializeMermaid();
      if (!initSuccess || !mermaid) {
        throw new Error('Mermaid initialization failed. Library may not be loaded correctly.');
      }
      mermaidReady = true;
    }

    if (!code || code.trim() === '') {
      throw new Error('Empty Mermaid code provided');
    }

    const { svg } = await mermaid.render('mermaid-diagram-' + Date.now(), code);

    // Pre-process SVG to prevent text clipping before conversion
    const processedSvg = preventTextClipping(svg);

    // Validate SVG content
    if (!processedSvg || processedSvg.length < 100) {
      throw new Error('Generated SVG is too small or empty');
    }

    if (!processedSvg.includes('<svg') || !processedSvg.includes('</svg>')) {
      throw new Error('Generated content is not valid SVG');
    }

    // Apply 10/16 scaling to achieve 10px font-size effect
    const result = await renderSvgToPng(processedSvg, 10 / 16);
    return result;
  } catch (error) {
    return { error: error.message };
  }
}

// Render HTML to PNG
async function renderHtmlToPng(htmlContent, targetWidth = 1200) {
  try {
    if (typeof html2canvas === 'undefined') {
      throw new Error('html2canvas not loaded');
    }

  const container = document.getElementById('html-container');
  const normalizedTargetWidth = Number.isFinite(targetWidth) && targetWidth > 0 ? targetWidth : null;
  container.style.cssText = 'display: inline-block; position: relative; background: transparent; padding: 0; margin: 0; width: auto;';
    container.innerHTML = htmlContent;

    // Give the layout engine a tick in the offscreen document context
    container.offsetHeight;
    await new Promise((resolve) => setTimeout(resolve, 0));

    const rect = container.getBoundingClientRect();
  const widthFallback = normalizedTargetWidth || 1;
  const rawWidth = rect.width || container.scrollWidth || container.offsetWidth || widthFallback;
    const measuredWidth = Math.ceil(rawWidth);
  const captureWidth = measuredWidth > 0 ? measuredWidth : widthFallback;

    container.style.width = `${captureWidth}px`;
    container.style.display = 'block';

    // Use html2canvas to capture
    const canvas = await html2canvas(container, {
      backgroundColor: null,
      scale: 4,
      logging: false,
      useCORS: true,
      allowTaint: true,
  width: captureWidth,
  windowWidth: Math.max(captureWidth, normalizedTargetWidth || 0),
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc, element) => {
        // Set willReadFrequently for better performance
        const canvases = clonedDoc.getElementsByTagName('canvas');
        for (let canvas of canvases) {
          if (canvas.getContext) {
            canvas.getContext('2d', { willReadFrequently: true });
          }
        }
      }
    });

    const pngDataUrl = canvas.toDataURL('image/png', 1.0);
    const base64Data = pngDataUrl.replace(/^data:image\/png;base64,/, '');

    // Cleanup
  container.innerHTML = '';
  container.style.cssText = 'display: block; background: transparent;';

    return {
      base64: base64Data,
      width: canvas.width,
      height: canvas.height
    };
  } catch (error) {
    // Cleanup on error
    const container = document.getElementById('html-container');
    container.innerHTML = '';
    return { error: error.message };
  }
}

// Render SVG to PNG
async function renderSvgToPng(svgContent, contentScale = 1.0) {
  try {
    const container = document.getElementById('svg-container');
    container.innerHTML = svgContent;

    const svgEl = container.querySelector('svg');
    if (!svgEl) {
      throw new Error('No SVG element found');
    }

    // Critical fix: Add more robust waiting for layout completion
    // Force multiple reflows to ensure layout is stable
    container.offsetHeight;
    svgEl.getBoundingClientRect();
    await new Promise(resolve => setTimeout(resolve, 100));

    // Wait for fonts to load if needed
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // Force another reflow after font loading
    container.offsetHeight;
    svgEl.getBoundingClientRect();
    await new Promise(resolve => setTimeout(resolve, 50));

    // Get dimensions
    const viewBox = svgEl.getAttribute('viewBox');
    let width, height;

    if (viewBox) {
      const parts = viewBox.split(/\s+/);
      width = Math.ceil(parseFloat(parts[2]) * contentScale);
      height = Math.ceil(parseFloat(parts[3]) * contentScale);
    } else {
      width = Math.ceil((parseFloat(svgEl.getAttribute('width')) || 800) * contentScale);
      height = Math.ceil((parseFloat(svgEl.getAttribute('height')) || 600) * contentScale);
    }

    // Create canvas
    const canvas = document.getElementById('png-canvas');
    const scale = 4;
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Convert SVG to image
    const svgString = new XMLSerializer().serializeToString(svgEl);

    // Use blob URL instead of data URL for large SVGs to avoid length limits
    let imgSrc;
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });

    if (svgString.length > 500000) { // 500KB threshold
      imgSrc = URL.createObjectURL(svgBlob);
    } else {
      const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
      imgSrc = dataUrl;
    }

    const img = new Image();
    await new Promise((resolve, reject) => {
      // Add timeout to handle hanging image loads
      const timeout = setTimeout(() => {
        reject(new Error('Image loading timeout'));
      }, 10000); // 10 second timeout

      img.onload = () => {
        clearTimeout(timeout);
        // Cleanup blob URL if used
        if (imgSrc.startsWith('blob:')) {
          URL.revokeObjectURL(imgSrc);
        }
        resolve();
      };
      img.onerror = (error) => {
        clearTimeout(timeout);

        // Cleanup blob URL if used
        if (imgSrc.startsWith('blob:')) {
          URL.revokeObjectURL(imgSrc);
        }
        reject(new Error(`Image loading failed: ${error.message || 'Unknown error'}`));
      };
      img.src = imgSrc;
    });

    // Validate image dimensions before drawing
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      throw new Error('Invalid image dimensions: ' + img.naturalWidth + 'x' + img.naturalHeight);
    }

  ctx.drawImage(img, 0, 0, width, height);

    // Enhanced content verification with pixel sampling
    const sampleRegions = [
      { name: 'top-left', x: 0, y: 0, size: Math.min(width, height, 100) },
      { name: 'center', x: Math.floor(width / 2) - 50, y: Math.floor(height / 2) - 50, size: 100 },
      { name: 'bottom-right', x: Math.max(0, width - 100), y: Math.max(0, height - 100), size: 100 }
    ];

    let totalNonWhitePixels = 0;
    let totalSampledPixels = 0;

    sampleRegions.forEach(region => {
      const startX = Math.max(0, region.x);
      const startY = Math.max(0, region.y);
      const endX = Math.min(width, startX + region.size);
      const endY = Math.min(height, startY + region.size);
      const regionWidth = endX - startX;
      const regionHeight = endY - startY;

      if (regionWidth > 0 && regionHeight > 0) {
        const imageData = ctx.getImageData(startX * scale, startY * scale, regionWidth * scale, regionHeight * scale);
        let regionNonWhite = 0;
        let regionTotal = 0;

        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          const alpha = imageData.data[i + 3];

          // Skip transparent pixels
          if (alpha < 10) continue;

          regionTotal++;
          totalSampledPixels++;

          // Check if pixel is not white/near-white
          if (r < 240 || g < 240 || b < 240) {
            regionNonWhite++;
            totalNonWhitePixels++;
          }
        }
      }
    });

    const pngDataUrl = canvas.toDataURL('image/png', 1.0);
    const base64Data = pngDataUrl.replace(/^data:image\/png;base64,/, '');

    // Cleanup
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
    container.innerHTML = '';

    return {
      base64: base64Data,
      width: canvas.width,
      height: canvas.height
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Prevent text clipping in SVG by modifying styles and dimensions
 */
function preventTextClipping(svgContent) {
  const antiClippingStyles = `
      /* The key fix: prevent foreignObject from clipping text */
      foreignObject {
        overflow: visible !important;
      }

      svg {
        background: transparent !important;
      }
  `;

  // Insert styles inside the existing <style> tag or create new one
  if (svgContent.includes('</style>')) {
    svgContent = svgContent.replace('</style>', antiClippingStyles + '</style>');
  } else if (svgContent.includes('<svg')) {
    svgContent = svgContent.replace('>', '><style>' + antiClippingStyles + '</style>');
  }

  return svgContent;
}

// Signal that the offscreen document is ready
chrome.runtime.sendMessage({ type: 'offscreenReady' }).then(() => {
}).catch(error => {
});