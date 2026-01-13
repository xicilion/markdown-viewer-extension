/**
 * Inline Markdown Parser
 *
 * A lightweight parser for basic inline markdown syntax.
 * Designed for use in canvas nodes where full markdown is not needed.
 *
 * Supported syntax:
 * - # H1, ## H2, ### H3, #### H4, ##### H5, ###### H6 (headings)
 * - **bold** or __bold__
 * - *italic* or _italic_
 * - `code`
 * - ~~strikethrough~~
 * - [link text](url)
 * - Newlines preserved
 */

/**
 * Token types for inline markdown
 */
type TokenType = 'text' | 'bold' | 'italic' | 'code' | 'strikethrough' | 'link';

interface Token {
  type: TokenType;
  content: string;
  url?: string; // For links
}

/**
 * Heading level info
 */
interface HeadingInfo {
  level: number; // 1-6
  content: string;
}

/**
 * Check if line is a heading and extract level and content
 */
function parseHeading(line: string): HeadingInfo | null {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (match) {
    return {
      level: match[1].length,
      content: match[2]
    };
  }
  return null;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parse inline markdown and return tokens
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let textBuffer = '';

  const flushText = () => {
    if (textBuffer) {
      tokens.push({ type: 'text', content: textBuffer });
      textBuffer = '';
    }
  };

  while (pos < text.length) {
    // Check for inline code (highest priority to prevent nested parsing)
    if (text[pos] === '`') {
      const endPos = text.indexOf('`', pos + 1);
      if (endPos !== -1) {
        flushText();
        tokens.push({ type: 'code', content: text.slice(pos + 1, endPos) });
        pos = endPos + 1;
        continue;
      }
    }

    // Check for strikethrough ~~text~~
    if (text.slice(pos, pos + 2) === '~~') {
      const endPos = text.indexOf('~~', pos + 2);
      if (endPos !== -1) {
        flushText();
        tokens.push({ type: 'strikethrough', content: text.slice(pos + 2, endPos) });
        pos = endPos + 2;
        continue;
      }
    }

    // Check for bold **text** or __text__
    if (text.slice(pos, pos + 2) === '**') {
      const endPos = text.indexOf('**', pos + 2);
      if (endPos !== -1) {
        flushText();
        tokens.push({ type: 'bold', content: text.slice(pos + 2, endPos) });
        pos = endPos + 2;
        continue;
      }
    }
    if (text.slice(pos, pos + 2) === '__') {
      const endPos = text.indexOf('__', pos + 2);
      if (endPos !== -1) {
        flushText();
        tokens.push({ type: 'bold', content: text.slice(pos + 2, endPos) });
        pos = endPos + 2;
        continue;
      }
    }

    // Check for italic *text* or _text_ (single delimiter)
    // Make sure it's not part of ** or __
    if (text[pos] === '*' && text[pos + 1] !== '*') {
      const endPos = findMatchingDelimiter(text, '*', pos + 1);
      if (endPos !== -1) {
        flushText();
        tokens.push({ type: 'italic', content: text.slice(pos + 1, endPos) });
        pos = endPos + 1;
        continue;
      }
    }
    if (text[pos] === '_' && text[pos + 1] !== '_') {
      const endPos = findMatchingDelimiter(text, '_', pos + 1);
      if (endPos !== -1) {
        flushText();
        tokens.push({ type: 'italic', content: text.slice(pos + 1, endPos) });
        pos = endPos + 1;
        continue;
      }
    }

    // Check for link [text](url)
    if (text[pos] === '[') {
      const bracketEnd = text.indexOf(']', pos + 1);
      if (bracketEnd !== -1 && text[bracketEnd + 1] === '(') {
        const parenEnd = text.indexOf(')', bracketEnd + 2);
        if (parenEnd !== -1) {
          flushText();
          const linkText = text.slice(pos + 1, bracketEnd);
          const linkUrl = text.slice(bracketEnd + 2, parenEnd);
          tokens.push({ type: 'link', content: linkText, url: linkUrl });
          pos = parenEnd + 1;
          continue;
        }
      }
    }

    // Regular character
    textBuffer += text[pos];
    pos++;
  }

  flushText();
  return tokens;
}

/**
 * Find matching single delimiter, ensuring it's not doubled
 */
function findMatchingDelimiter(text: string, delimiter: string, startPos: number): number {
  for (let i = startPos; i < text.length; i++) {
    if (text[i] === delimiter) {
      // Make sure it's not a double delimiter
      if (text[i - 1] !== delimiter && text[i + 1] !== delimiter) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Convert tokens to HTML
 */
function tokensToHtml(tokens: Token[]): string {
  return tokens.map(token => {
    switch (token.type) {
      case 'text':
        return escapeHtml(token.content);
      case 'bold':
        return `<strong>${escapeHtml(token.content)}</strong>`;
      case 'italic':
        return `<em>${escapeHtml(token.content)}</em>`;
      case 'code':
        return `<code style="background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 3px; font-family: monospace;">${escapeHtml(token.content)}</code>`;
      case 'strikethrough':
        return `<del>${escapeHtml(token.content)}</del>`;
      case 'link':
        return `<a href="${escapeHtml(token.url || '')}" style="color: #0066cc; text-decoration: underline;">${escapeHtml(token.content)}</a>`;
      default:
        return escapeHtml(token.content);
    }
  }).join('');
}

/**
 * Parse inline markdown text and convert to HTML
 *
 * @param text - Raw markdown text
 * @returns HTML string with inline formatting
 */
export function parseInlineMarkdown(text: string): string {
  // Process line by line to preserve newlines and handle headings
  const lines = text.split('\n');
  const htmlLines = lines.map(line => {
    // Check for heading first
    const heading = parseHeading(line);
    if (heading) {
      const tokens = tokenize(heading.content);
      const content = tokensToHtml(tokens);
      return `<h${heading.level} style="margin:0">${content}</h${heading.level}>`;
    }
    // Regular line
    const tokens = tokenize(line);
    return tokensToHtml(tokens);
  });
  return htmlLines.join('<br/>');
}

/**
 * Check if text contains markdown syntax
 * Used to optimize rendering by skipping parsing for plain text
 */
export function hasInlineMarkdown(text: string): boolean {
  return /[*_`~\[#]/.test(text);
}
