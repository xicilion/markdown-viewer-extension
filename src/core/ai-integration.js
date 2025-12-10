// AI Chat Integration Script
// Injects "Save as Image" button into ChatGPT and Gemini

const ICONS = {
    IMAGE: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M15 6l-3 3-3-3"/><path d="M12 18V9"/></svg>`
};

// Track processed response containers globally
const processedResponses = new WeakSet();

// Debounce flag to prevent double-save
let isSaving = false;

function init() {
    console.log('[MD Viewer] AI Integration script loaded');

    // Initial check after a short delay
    setTimeout(() => handleMutations(), 1000);

    const observer = new MutationObserver(() => {
        handleMutations();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function handleMutations() {
    const hostname = window.location.hostname;

    if (hostname.includes('chatgpt.com')) {
        handleChatGPT();
    } else if (hostname.includes('gemini.google.com')) {
        handleGemini();
    }
}

function handleChatGPT() {
    // Find all "Copy" buttons by looking for buttons with clipboard SVG
    const allButtons = document.querySelectorAll('button');

    allButtons.forEach(btn => {
        // Check if this is a Copy button by looking for the clipboard icon
        const svg = btn.querySelector('svg');
        if (!svg) return;

        // The button is inside a flex container with other action buttons
        const container = btn.closest('.flex.gap-1, .flex.items-center.gap-1, [class*="gap-"]');
        if (!container) return;

        // Skip if we already processed this container
        if (processedResponses.has(container)) return;

        // Make sure this is an action bar (should have multiple buttons)
        const buttons = container.querySelectorAll('button');
        if (buttons.length < 2) return;

        // Check if our button already exists
        if (container.querySelector('[data-md-viewer-btn]')) return;

        // Find the message content - go up to find the article or message container
        const article = container.closest('article, [data-message-author-role], .group');
        if (!article) return;

        // Check if this is an assistant message (not user message)
        const isAssistant = article.getAttribute('data-message-author-role') === 'assistant' ||
            article.querySelector('.markdown') ||
            article.classList.contains('agent-turn');

        if (!isAssistant) return;

        processedResponses.add(container);

        const myBtn = createButton();
        myBtn.setAttribute('data-md-viewer-btn', 'true');
        myBtn.className = btn.className;
        myBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            extractAndSave('ChatGPT', article);
        };

        container.appendChild(myBtn);
        console.log('[MD Viewer] Injected button into ChatGPT');
    });
}

function handleGemini() {
    // Find all model-response elements - these are AI response containers
    const responseContainers = document.querySelectorAll('model-response, message-content');

    responseContainers.forEach(responseEl => {
        if (processedResponses.has(responseEl)) return;

        // Look for the actions toolbar within this response
        const actionsToolbar = responseEl.querySelector('message-actions') ||
            responseEl.querySelector('.actions-toolbar') ||
            responseEl.querySelector('[class*="actions"]');

        if (!actionsToolbar) return;

        // Check if we already added our button
        if (actionsToolbar.querySelector('[data-md-viewer-btn]')) return;

        // Find the Copy button to match its styling
        const copyBtn = actionsToolbar.querySelector('button, [role="button"]');
        if (!copyBtn) return;

        processedResponses.add(responseEl);

        const myBtn = createButton();
        myBtn.setAttribute('data-md-viewer-btn', 'true');
        myBtn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; color: inherit; margin-left: 8px; border: none; background: transparent;';

        myBtn.onmouseover = () => myBtn.style.backgroundColor = 'rgba(128,128,128,0.1)';
        myBtn.onmouseout = () => myBtn.style.backgroundColor = 'transparent';

        myBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            extractAndSave('Gemini', responseEl);
        };

        actionsToolbar.appendChild(myBtn);
        console.log('[MD Viewer] Injected button into Gemini');
    });
}

function createButton() {
    const btn = document.createElement('button');
    btn.innerHTML = ICONS.IMAGE;
    btn.title = 'Save as Image (Markdown Viewer)';
    btn.type = 'button';
    btn.style.cursor = 'pointer';
    return btn;
}

function generateFilename(aiSource) {
    // Format: ChatGPT_20251205_220641.png or Gemini_20251205_220641.png
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${aiSource}_${year}${month}${day}_${hours}${minutes}${seconds}.png`;
}

async function extractAndSave(aiSource, container) {
    // Strict debounce check
    if (isSaving) {
        console.log('[MD Viewer] Already saving, skipping...');
        return;
    }
    isSaving = true;

    try {
        // Find the content div
        let contentDiv;
        if (aiSource === 'ChatGPT') {
            contentDiv = container.querySelector('.markdown');
        } else {
            contentDiv = container.querySelector('.markdown, .content, .response-content, message-content');
        }

        if (!contentDiv) {
            console.log('[MD Viewer] No content found');
            return;
        }

        const htmlContent = contentDiv.outerHTML;
        const filename = generateFilename(aiSource);

        console.log('[MD Viewer] Sending to renderer:', filename);

        chrome.runtime.sendMessage({
            action: 'RENDER_MARKDOWN_TO_IMAGE',
            content: htmlContent,
            contentType: 'html',
            width: 450, // Mobile optimized width
            filename: filename
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[MD Viewer] Error:', chrome.runtime.lastError);
                alert('Failed to connect to extension.');
            } else if (response && response.error) {
                alert('Rendering failed: ' + response.error);
            }
        });
    } finally {
        // Release the lock after 2 seconds
        setTimeout(() => {
            isSaving = false;
            console.log('[MD Viewer] Save lock released');
        }, 2000);
    }
}

init();
