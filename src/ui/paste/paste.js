import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('markdown-input');
  const convertBtn = document.getElementById('convert-btn');
  const saveBtn = document.getElementById('save-image-btn');
  const preview = document.getElementById('preview-container');

  // Auto-convert on input with debounce
  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderMarkdown(input.value);
    }, 500);
  });

  convertBtn.addEventListener('click', () => {
    renderMarkdown(input.value);
  });

  // Mobile View Toggle
  const mobileToggle = document.getElementById('mobile-view-toggle');
  mobileToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      preview.classList.add('mobile-view');
    } else {
      preview.classList.remove('mobile-view');
    }
  });

  saveBtn.addEventListener('click', async () => {
    if (!preview.innerHTML.trim()) {
      alert('Nothing to save!');
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      // Temporarily modify style to capture full height
      const originalOverflow = preview.style.overflow;
      const originalHeight = preview.style.height;

      preview.style.overflow = 'visible';
      preview.style.height = 'auto';

      // Use html2canvas to capture the preview container
      const canvas = await html2canvas(preview, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scale: 2, // Higher quality
        height: preview.scrollHeight,
        windowHeight: preview.scrollHeight
      });

      // Restore styles
      preview.style.overflow = originalOverflow;
      preview.style.height = originalHeight;

      const link = document.createElement('a');
      link.download = 'markdown-export.jpg';
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();

    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save image: ' + error.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save as Image';
    }
  });

  async function renderMarkdown(text) {
    if (!text) {
      preview.innerHTML = '';
      return;
    }

    try {
      const file = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeSlug)
        .use(rehypeHighlight)
        .use(rehypeStringify)
        .process(text);

      preview.innerHTML = String(file);
    } catch (error) {
      console.error('Markdown rendering error:', error);
      preview.innerHTML = `<div style="color: red;">Error rendering Markdown: ${error.message}</div>`;
    }
  }
});
