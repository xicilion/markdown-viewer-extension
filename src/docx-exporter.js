// DOCX Exporter for Markdown Viewer Extension
// Converts Markdown AST to DOCX format using docx library

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  Table,
  TableCell,
  TableRow,
  WidthType,
  BorderStyle,
  convertInchesToTwip,
  Math as MathBlock,
  MathRun,
  TableLayoutType,
  ExternalHyperlink,
} from 'docx';
import { VerticalAlign as VerticalAlignTable } from 'docx';
import { mathJaxReady, convertLatex2Math } from './docx-math-converter.js';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import { uploadInChunks, abortUpload } from './upload-manager.js';
import hljs from 'highlight.js/lib/common';
import { loadThemeForDOCX } from './theme-to-docx.js';
import themeManager from './theme-manager.js';
import { getPluginForNode } from './plugins/index.js';

/**
 * Main class for exporting Markdown to DOCX
 */
class DocxExporter {
  constructor(renderer = null) {
    this.renderer = renderer; // ExtensionRenderer instance for rendering images
    this.imageCache = new Map(); // Cache for processed images
    this.listInstanceCounter = 0; // Counter for list instances to restart numbering
    this.mathJaxInitialized = false; // Track MathJax initialization
    this.baseUrl = null; // Base URL for resolving relative paths
    this.pendingBlockSpacing = 0; // Spacing to apply before the next block-level element
    this.themeStyles = null; // Theme configuration for DOCX styles
    this.spacingScheme = null; // Spacing scheme from theme
  }

  getHighlightColor(classList) {
    if (!classList) {
      return null;
    }

    const tokens = Array.isArray(classList)
      ? classList
      : typeof classList === 'string'
        ? classList.split(/\s+/)
        : Array.from(classList);

    for (const rawToken of tokens) {
      if (!rawToken) {
        continue;
      }

      const token = rawToken.startsWith('hljs-') ? rawToken.slice(5) : rawToken;
      if (!token) {
        continue;
      }

      const normalized = token.replace(/-/g, '_');
      
      // Use theme color
      const themeColor = this.themeStyles.codeColors.colors[normalized];
      if (themeColor) {
        return themeColor.replace('#', '');
      }
    }

    return null;
  }

  appendCodeTextRuns(text, runs, color) {
    if (text === '') {
      return;
    }

    const segments = text.split('\n');
    const lastIndex = segments.length - 1;
    const defaultColor = this.themeStyles.codeColors.foreground;
    const appliedColor = color || defaultColor;
    
    // Use theme code font and size (already converted to half-points in theme-to-docx.js)
    const codeStyle = this.themeStyles.characterStyles.code;
    const codeFont = codeStyle.font;
    const codeSize = codeStyle.size;

    segments.forEach((segment, index) => {
      if (segment.length > 0) {
        runs.push(new TextRun({
          text: segment,
          font: codeFont,
          size: codeSize,
          preserve: true,
          color: appliedColor,
        }));
      }

      if (index < lastIndex) {
        runs.push(new TextRun({ text: '', break: 1 }));
      }
    });
  }

  collectHighlightedRuns(node, runs, inheritedColor = null) {
    if (inheritedColor === null) {
      inheritedColor = this.themeStyles.codeColors.foreground;
    }
    if (!node) {
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      this.appendCodeTextRuns(node.nodeValue || '', runs, inheritedColor);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const elementColor = this.getHighlightColor(node.classList) || inheritedColor;
    const nextColor = elementColor || inheritedColor;

    node.childNodes.forEach((child) => {
      this.collectHighlightedRuns(child, runs, nextColor);
    });
  }

  getHighlightedRunsForCode(code, language) {
    const runs = [];

    if (!code) {
      // Use theme code font and size (already converted to half-points in theme-to-docx.js)
      const codeStyle = this.themeStyles.characterStyles.code;
      const codeFont = codeStyle.font;
      const codeSize = codeStyle.size;
      const defaultColor = this.themeStyles.codeColors.foreground;
      
      runs.push(new TextRun({
        text: '',
        font: codeFont,
        size: codeSize,
        preserve: true,
        color: defaultColor,
      }));
      return runs;
    }

    let highlightResult = null;

    try {
      if (language && hljs.getLanguage(language)) {
        highlightResult = hljs.highlight(code, {
          language,
          ignoreIllegals: true,
        });
      } else {
        // No language specified - don't highlight (consistent with Web behavior)
        highlightResult = null;
      }
    } catch (error) {
      console.warn('Highlight error:', error);
    }

    const defaultColor = this.themeStyles.codeColors.foreground;
    
    if (highlightResult && highlightResult.value) {
      const container = document.createElement('div');
      container.innerHTML = highlightResult.value;
      this.collectHighlightedRuns(container, runs, defaultColor);
    }

    if (runs.length === 0) {
      this.appendCodeTextRuns(code, runs, defaultColor);
    }

    return runs;
  }

  /**
   * Set base URL for resolving relative image paths
   * @param {string} url - The base URL (typically the markdown file's location)
   */
  setBaseUrl(url) {
    this.baseUrl = url;
  }

  /**
   * Initialize MathJax for LaTeX conversion
   */
  async initializeMathJax() {
    if (!this.mathJaxInitialized) {
      await mathJaxReady();
      this.mathJaxInitialized = true;
    }
  }

  /**
   * Export markdown content to DOCX file
   * @param {string} markdown - Raw markdown content
   * @param {string} filename - Output filename (default: 'document.docx')
   */
  async exportToDocx(markdown, filename = 'document.docx', onProgress = null) {
    try {
      // Set base URL for resolving relative image paths
      this.setBaseUrl(window.location.href);

      // Load theme configuration - use currently selected theme
      const selectedThemeId = await themeManager.loadSelectedTheme();
      const themeStyles = await loadThemeForDOCX(selectedThemeId);
      this.themeStyles = themeStyles;
      this.spacingScheme = null; // Not used directly, accessed via themeStyles
      
      console.log('[DOCX Exporter] Theme loaded:', selectedThemeId, themeStyles);

      // Initialize progress tracking
      this.progressCallback = onProgress;
      this.totalResources = 0;
      this.processedResources = 0;

      // Initialize MathJax first
      await this.initializeMathJax();

      // Parse markdown to AST
      const ast = this.parseMarkdown(markdown);

      // Count resources that need processing (images and plugin-handled diagrams)
      this.totalResources = this.countResources(ast);

      // Report initial progress
      if (onProgress && this.totalResources > 0) {
        onProgress(0, this.totalResources);
      }

      // Convert AST to docx elements
      const sections = await this.convertAstToDocx(ast);

      // Create document
      const doc = new Document({
        numbering: {
          config: [
            {
              reference: 'default-ordered-list',
              levels: [
                {
                  level: 0,
                  format: 'decimal', // 1. 2. 3.
                  text: '%1.',
                  alignment: AlignmentType.START,
                  style: {
                    paragraph: {
                      indent: {
                        left: convertInchesToTwip(0.42),  // 0.42 inch left indent (20px ≈ 0.28")
                        hanging: convertInchesToTwip(0.28) // 0.28 inch hanging indent for number spacing
                      },
                    },
                  },
                },
                {
                  level: 1,
                  format: 'lowerRoman', // i. ii. iii. iv. v. vi. vii.
                  text: '%2.',
                  alignment: AlignmentType.START,
                  style: {
                    paragraph: {
                      indent: {
                        left: convertInchesToTwip(0.84),  // 0.84 inch for nested level
                        hanging: convertInchesToTwip(0.28)
                      },
                    },
                  },
                },
                {
                  level: 2,
                  format: 'lowerLetter', // a. b. c.
                  text: '%3.',
                  alignment: AlignmentType.START,
                  style: {
                    paragraph: {
                      indent: {
                        left: convertInchesToTwip(1.26),  // 1.26 inch for double-nested level
                        hanging: convertInchesToTwip(0.28)
                      },
                    },
                  },
                },
                {
                  level: 3,
                  format: 'lowerLetter', // a. b. c. (same as level 2)
                  text: '%4.',
                  alignment: AlignmentType.START,
                  style: {
                    paragraph: {
                      indent: {
                        left: convertInchesToTwip(1.68),  // 1.68 inch for level 4
                        hanging: convertInchesToTwip(0.28)
                      },
                    },
                  },
                },
                {
                  level: 4,
                  format: 'lowerLetter', // a. b. c. (same as level 2)
                  text: '%5.',
                  alignment: AlignmentType.START,
                  style: {
                    paragraph: {
                      indent: {
                        left: convertInchesToTwip(2.10),  // 2.10 inch for level 5
                        hanging: convertInchesToTwip(0.28)
                      },
                    },
                  },
                },
                {
                  level: 5,
                  format: 'lowerLetter', // a. b. c. (same as level 2)
                  text: '%6.',
                  alignment: AlignmentType.START,
                  style: {
                    paragraph: {
                      indent: {
                        left: convertInchesToTwip(2.52),  // 2.52 inch for level 6
                        hanging: convertInchesToTwip(0.28)
                      },
                    },
                  },
                },
                {
                  level: 6,
                  format: 'lowerLetter', // a. b. c. (same as level 2)
                  text: '%7.',
                  alignment: AlignmentType.START,
                  style: {
                    paragraph: {
                      indent: {
                        left: convertInchesToTwip(2.94),  // 2.94 inch for level 7
                        hanging: convertInchesToTwip(0.28)
                      },
                    },
                  },
                },
                {
                  level: 7,
                  format: 'lowerLetter', // a. b. c. (same as level 2)
                  text: '%8.',
                  alignment: AlignmentType.START,
                  style: {
                    paragraph: {
                      indent: {
                        left: convertInchesToTwip(3.36),  // 3.36 inch for level 8
                        hanging: convertInchesToTwip(0.28)
                      },
                    },
                  },
                },
                {
                  level: 8,
                  format: 'lowerLetter', // a. b. c. (same as level 2)
                  text: '%9.',
                  alignment: AlignmentType.START,
                  style: {
                    paragraph: {
                      indent: {
                        left: convertInchesToTwip(4.5),  // 4.5 inch for level 9
                        hanging: convertInchesToTwip(0.30)
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
        styles: {
          default: {
            document: this.themeStyles.default,
            heading1: this.themeStyles.paragraphStyles.heading1,
            heading2: this.themeStyles.paragraphStyles.heading2,
            heading3: this.themeStyles.paragraphStyles.heading3,
            heading4: this.themeStyles.paragraphStyles.heading4,
            heading5: this.themeStyles.paragraphStyles.heading5,
            heading6: this.themeStyles.paragraphStyles.heading6,
          },
        },
        sections: [{
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                right: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1),
              },
            },
          },
          children: sections,
        }],
      });

      // Generate blob
      try {
        const blob = await Packer.toBlob(doc);

        // Download file
        this.downloadBlob(blob, filename);

        // Clean up progress tracking
        this.progressCallback = null;
        this.totalResources = 0;
        this.processedResources = 0;

        return { success: true };
      } catch (packError) {
        console.error('Failed to generate DOCX:', packError);
        throw new Error(`Failed to generate DOCX: ${packError.message}`);
      }
    } catch (error) {
      console.error('DOCX export error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Count resources that need processing (images and diagrams)
   */
  countResources(ast) {
    let count = 0;

    const countNode = (node) => {
      // Count images (including SVG images)
      if (node.type === 'image') {
        count++;
      }

      // Count any node that can be handled by a plugin
      if (getPluginForNode(node)) {
        count++;
      }

      // Recursively count in children
      if (node.children) {
        node.children.forEach(countNode);
      }
    };

    if (ast.children) {
      ast.children.forEach(countNode);
    }

    return count;
  }

  /**
   * Report progress for a processed resource
   */
  reportResourceProgress() {
    this.processedResources++;
    if (this.progressCallback && this.totalResources > 0) {
      this.progressCallback(this.processedResources, this.totalResources);
    }
  }

  /**
   * Parse markdown to AST
   */
  parseMarkdown(markdown) {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkBreaks) // Add line break processing
      .use(remarkMath);

    // Parse and transform AST (remark-breaks needs runSync to work)
    const ast = processor.parse(markdown);
    const transformed = processor.runSync(ast);

    // Collect link definitions for resolving linkReference nodes
    this.linkDefinitions = new Map();
    visit(transformed, 'definition', (node) => {
      this.linkDefinitions.set(node.identifier.toLowerCase(), {
        url: node.url,
        title: node.title
      });
    });

    return transformed;
  }

  /**
   * Convert AST to docx elements
   */
  async convertAstToDocx(ast) {
    const elements = [];
    let lastNodeType = null;

    // Reset list instance counter for each document
    this.listInstanceCounter = 0;
    this.pendingBlockSpacing = 0;

    for (const node of ast.children) {
      // Add minimal spacing paragraph between consecutive thematicBreaks to prevent merging
      if (node.type === 'thematicBreak' && lastNodeType === 'thematicBreak') {
        elements.push(new Paragraph({
          text: '',
          alignment: AlignmentType.LEFT, // Explicitly set left alignment
          spacing: {
            before: 0,
            after: 0,
            line: 1,  // Minimal line height (almost invisible)
            lineRule: 'exact',
          },
        }));
      }

      // Add spacing paragraph between consecutive tables to prevent merging in DOCX
      if (node.type === 'table' && lastNodeType === 'table') {
        elements.push(new Paragraph({
          text: '',
          alignment: AlignmentType.LEFT, // Explicitly set left alignment
          spacing: {
            before: 120,  // 6pt spacing before
            after: 120,   // 6pt spacing after
            line: 240,    // Normal line height
          },
        }));
      }

      const converted = await this.convertNode(node);
      if (converted) {
        if (Array.isArray(converted)) {
          elements.push(...converted);
        } else {
          elements.push(converted);
        }
      }

      lastNodeType = node.type;

      if (node.type === 'table') {
        this.pendingBlockSpacing = Math.max(this.pendingBlockSpacing, 360);
      }
    }

    return elements;
  }

  /**
   * Convert a single AST node to docx element
   */
  async convertNode(node, parentStyle = {}) {
    // First, try to find a plugin that can handle this node
    const plugin = getPluginForNode(node);
    if (plugin) {
      const docxHelpers = {
        Paragraph,
        TextRun,
        ImageRun,
        AlignmentType,
        convertInchesToTwip,
        applyPendingSpacing: this.applyPendingSpacing.bind(this),
        themeStyles: this.themeStyles
      };
      const result = await plugin.convertToDOCX(this.renderer, node.value, docxHelpers);
      // Report progress for plugin-handled nodes
      this.reportResourceProgress();
      return result;
    }

    // Handle node types that don't use plugins
    switch (node.type) {
      case 'heading':
        return this.convertHeading(node);

      case 'paragraph':
        return await this.convertParagraph(node, parentStyle);

      case 'list':
        return await this.convertList(node);

      case 'listItem':
        return await this.convertListItem(node);

      case 'code':
        return this.convertCodeBlock(node);

      case 'blockquote':
        return await this.convertBlockquote(node);

      case 'table':
        return await this.convertTable(node);

      case 'thematicBreak':
        return this.convertThematicBreak();

      case 'html':
        return this.convertHtml(node);

      case 'math':
        return this.convertMathBlock(node);

      default:
        return null;
    }
  }

  /**
   * Convert heading node
   */
  convertHeading(node) {
    const level = this.getHeadingLevel(node.depth);
    const text = this.extractText(node);

    // Get heading style from theme
    const headingStyleKey = `heading${node.depth}`;
    const headingStyle = this.themeStyles?.paragraphStyles?.[headingStyleKey];
    
    // Use theme spacing if available, otherwise use defaults
    const defaultSpacingBefore = node.depth === 1 ? 240 : 240; // 12pt before
    const defaultSpacingAfter = 120; // 6pt after
    
    const spacingBefore = headingStyle?.paragraph?.spacing?.before || defaultSpacingBefore;
    const spacingAfter = headingStyle?.paragraph?.spacing?.after || defaultSpacingAfter;

    const paragraphConfig = {
      text: text,
      heading: level,
      spacing: this.applyPendingSpacing({
        before: spacingBefore,
        after: spacingAfter,
        line: 360, // 1.5 line spacing (360 = 1.5 * 240)
      }),
    };

    // Use alignment from theme style if available
    if (headingStyle?.paragraph?.alignment) {
      paragraphConfig.alignment = headingStyle.paragraph.alignment === 'center' 
        ? AlignmentType.CENTER 
        : AlignmentType.LEFT;
    }

    return new Paragraph(paragraphConfig);
  }

  /**
   * Get docx heading level with custom font sizes matching CSS
   */
  getHeadingLevel(depth) {
    const levels = {
      1: HeadingLevel.HEADING_1, // 24px -> 24pt
      2: HeadingLevel.HEADING_2, // 20px -> 20pt
      3: HeadingLevel.HEADING_3, // 18px -> 18pt
      4: HeadingLevel.HEADING_4, // 16px -> 16pt
      5: HeadingLevel.HEADING_5, // 14px -> 14pt
      6: HeadingLevel.HEADING_6, // 12px -> 12pt
    };
    return levels[depth] || HeadingLevel.HEADING_1;
  }

  /**
   * Apply spacing reserved for the next block-level element.
   */
  applyPendingSpacing(spacing = {}) {
    if (this.pendingBlockSpacing > 0) {
      const before = spacing.before || 0;
      spacing.before = Math.max(before, this.pendingBlockSpacing);
      this.pendingBlockSpacing = 0;
    }
    return spacing;
  }

  /**
   * Convert paragraph node
   */
  async convertParagraph(node, parentStyle = {}) {
    const children = await this.convertInlineNodes(node.children, parentStyle);

    // Get spacing from theme
    const paragraphSpacing = this.themeStyles.default.paragraph.spacing;
    const defaultLineSpacing = paragraphSpacing.line;
    const defaultAfterSpacing = paragraphSpacing.after;

    if (children.length === 0) {
      // Empty paragraph
      const spacing = this.applyPendingSpacing({
        after: defaultAfterSpacing,
        line: defaultLineSpacing,
      });

      return new Paragraph({
        text: '',
        spacing: spacing,
        alignment: AlignmentType.LEFT, // Explicitly set left alignment
      });
    }

    const spacing = this.applyPendingSpacing({
      after: defaultAfterSpacing,
      line: defaultLineSpacing,
    });

    return new Paragraph({
      children: children,
      spacing: spacing,
      alignment: AlignmentType.LEFT, // Explicitly set left alignment
    });
  }

  /**
   * Convert inline nodes (text, emphasis, strong, etc.)
   */
  async convertInlineNodes(nodes, parentStyle = {}) {
    const runs = [];

    // Get font and size from theme
    const bodyFont = this.themeStyles.default.run.font;
    const bodySize = this.themeStyles.default.run.size;
    
    const defaultStyle = {
      font: bodyFont,
      size: bodySize,
      ...parentStyle,
    };

    for (const node of nodes) {
      const converted = await this.convertInlineNode(node, defaultStyle);
      if (converted) {
        if (Array.isArray(converted)) {
          runs.push(...converted);
        } else {
          runs.push(converted);
        }
      }
    }

    return runs;
  }

  /**
   * Convert single inline node
   */
  async convertInlineNode(node, parentStyle = {}) {
    // First, check if a plugin can handle this node
    const plugin = getPluginForNode(node);
    if (plugin) {
      const docxHelpers = {
        Paragraph,
        TextRun,
        ImageRun,
        AlignmentType,
        convertInchesToTwip,
        applyPendingSpacing: this.applyPendingSpacing.bind(this),
        themeStyles: this.themeStyles
      };
      
      // For inline nodes, we need to handle URL fetching here
      let content = plugin.extractContent(node);
      if (content && plugin.isUrl && plugin.isUrl(content)) {
        // Fetch the content synchronously
        content = await plugin.fetchContent(content);
      }
      
      const result = await plugin.convertToDOCX(this.renderer, content, docxHelpers);
      this.reportResourceProgress();
      return result;
    }

    // Handle standard inline nodes
    switch (node.type) {
      case 'text':
        return new TextRun({
          text: node.value,
          ...parentStyle,
        });

      case 'strong':
        return await this.convertInlineNodes(node.children, { ...parentStyle, bold: true });

      case 'emphasis':
        return await this.convertInlineNodes(node.children, { ...parentStyle, italics: true });

      case 'delete':
        return await this.convertInlineNodes(node.children, { ...parentStyle, strike: true });

      case 'inlineCode':
        const codeStyle = this.themeStyles.characterStyles.code;
        return new TextRun({
          ...parentStyle,
          text: node.value,
          font: codeStyle.font,
          size: codeStyle.size, // Already converted to half-points in theme-to-docx.js
          shading: {
            fill: codeStyle.background,
          },
        });

      case 'link':
        return await this.convertLink(node, parentStyle);

      case 'linkReference':
        return await this.convertLinkReference(node, parentStyle);

      case 'image':
        return await this.convertImage(node);

      case 'inlineMath':
        return await this.convertInlineMath(node, parentStyle);

      case 'break':
        return new TextRun({ text: '', break: 1 });

      case 'html':
        // Handle inline HTML tags
        const htmlValue = node.value?.trim() || '';
        // Check if it's a <br> or <br/> tag
        if (/^<br\s*\/?>$/i.test(htmlValue)) {
          return new TextRun({ text: '', break: 1 });
        }
        // For other inline HTML, return the raw text (strip tags)
        return new TextRun({
          text: htmlValue.replace(/<[^>]+>/g, ''),
          ...parentStyle,
        });

      default:
        return null;
    }
  }

  /**
   * Convert link node
   */
  async convertLink(node, parentStyle) {
    const text = this.extractText(node);
    const url = node.url || '#'; // Use '#' for empty links

    // Create hyperlink with proper styling
    return new ExternalHyperlink({
      children: [
        new TextRun({
          text: text,
          style: 'Hyperlink',
          color: '0366D6', // GitHub blue matching CSS
          underline: {
            type: 'single',
            color: '0366D6',
          },
          ...parentStyle,
        }),
      ],
      link: url,
    });
  }

  /**
   * Convert link reference node (reference-style links)
   */
  async convertLinkReference(node, parentStyle) {
    const text = this.extractText(node);
    const identifier = node.identifier.toLowerCase();

    // Look up the definition for this reference
    const definition = this.linkDefinitions?.get(identifier);
    const url = definition?.url || '#'; // Use '#' if definition not found

    // Create hyperlink with proper styling
    return new ExternalHyperlink({
      children: [
        new TextRun({
          text: text,
          style: 'Hyperlink',
          color: '0366D6', // GitHub blue matching CSS
          underline: {
            type: 'single',
            color: '0366D6',
          },
          ...parentStyle,
        }),
      ],
      link: url,
    });
  }

  /**
   * Fetch image as ArrayBuffer
   * @param {string} url - Image URL (can be http://, file://, or data:)
   * @returns {Promise<{buffer: ArrayBuffer, contentType: string}>}
   */
  /**
   * Fetch image as ArrayBuffer
   * @param {string} url - Image URL (can be http://, file://, or data:)
   * @returns {Promise<{buffer: Uint8Array, contentType: string}>}
   */
  async fetchImageAsBuffer(url) {
    // Check cache first
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url);
    }

    // Handle data: URLs
    if (url.startsWith('data:')) {
      const match = url.match(/^data:([^;,]+)[^,]*,(.+)$/);
      if (!match) {
        throw new Error('Invalid data URL format');
      }

      const contentType = match[1];
      const base64Data = match[2];

      // Decode base64 to binary
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const result = {
        buffer: bytes,  // Return Uint8Array directly
        contentType: contentType
      };

      this.imageCache.set(url, result);
      return result;
    }

    // Handle http:// and https:// URLs - use background script to fetch
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'READ_LOCAL_FILE',
          filePath: url,
          binary: true
        }, (response) => {
          if (response.error) {
            reject(new Error(response.error));
            return;
          }

          // Convert base64 to Uint8Array
          const binaryString = atob(response.content);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Use content type from response, or determine from URL extension
          let contentType = response.contentType;
          if (!contentType) {
            const ext = url.split('.').pop().toLowerCase().split('?')[0];
            const contentTypeMap = {
              'png': 'image/png',
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'gif': 'image/gif',
              'bmp': 'image/bmp',
              'webp': 'image/webp',
              'svg': 'image/svg+xml'
            };
            contentType = contentTypeMap[ext] || 'image/png';
          }

          const result = {
            buffer: bytes,
            contentType: contentType
          };

          this.imageCache.set(url, result);
          resolve(result);
        });
      });
    }

    // Handle local file:// URLs
    const absoluteUrl = this.baseUrl ? new URL(url, this.baseUrl).href : url;

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'READ_LOCAL_FILE',
        filePath: absoluteUrl,
        binary: true
      }, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        // Convert base64 to Uint8Array
        const binaryString = atob(response.content);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Determine content type from file extension
        const ext = url.split('.').pop().toLowerCase();
        const contentTypeMap = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'bmp': 'image/bmp',
          'webp': 'image/webp'
        };
        const contentType = contentTypeMap[ext] || 'image/png';

        const result = {
          buffer: bytes,  // Return Uint8Array directly
          contentType: contentType
        };

        this.imageCache.set(url, result);
        resolve(result);
      });
    });
  }

  /**
   * Get image dimensions from buffer
   * @param {Uint8Array} buffer - Image buffer
   * @param {string} contentType - Image content type
   * @returns {Promise<{width: number, height: number}>}
   */
  async getImageDimensions(buffer, contentType) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([buffer], { type: contentType });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.width, height: img.height });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  }

  /**
   * Calculate appropriate dimensions for DOCX
   * Maximum width: 6 inches (page width with 1 inch margins on letter size)
   * @param {number} originalWidth - Original image width
   * @param {number} originalHeight - Original image height
   * @returns {Object} - {width: number, height: number} in pixels
   */
  calculateImageDimensions(originalWidth, originalHeight) {
    const maxWidthInches = 6; // 8.5 - 1 - 1 = 6.5, use 6 for safety
    const maxWidthPixels = maxWidthInches * 96; // 96 DPI = 576 pixels

    // If image is smaller than max width, use original size
    if (originalWidth <= maxWidthPixels) {
      return { width: originalWidth, height: originalHeight };
    }

    // Scale down proportionally
    const ratio = maxWidthPixels / originalWidth;
    return {
      width: maxWidthPixels,
      height: Math.round(originalHeight * ratio)
    };
  }

  /**
   * Convert image node
   */
  async convertImage(node) {
    try {
      // Fetch image as buffer (returns Uint8Array)
      const { buffer, contentType } = await this.fetchImageAsBuffer(node.url);

      // Get image dimensions
      const { width: originalWidth, height: originalHeight } =
        await this.getImageDimensions(buffer, contentType);

      // Calculate display dimensions in pixels
      const { width: widthPx, height: heightPx } = this.calculateImageDimensions(originalWidth, originalHeight);

      // Determine image type from content type or URL
      let imageType = 'png'; // default
      if (contentType) {
        if (contentType.includes('jpeg') || contentType.includes('jpg')) {
          imageType = 'jpg';
        } else if (contentType.includes('png')) {
          imageType = 'png';
        } else if (contentType.includes('gif')) {
          imageType = 'gif';
        } else if (contentType.includes('bmp')) {
          imageType = 'bmp';
        }
      } else {
        // Fallback: determine from URL extension
        const ext = node.url.toLowerCase().split('.').pop().split('?')[0];
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) {
          imageType = ext === 'jpeg' ? 'jpg' : ext;
        }
      }

      // Report progress after processing image
      this.reportResourceProgress();

      // Create ImageRun with complete parameters
      return new ImageRun({
        data: buffer,
        transformation: {
          width: widthPx,
          height: heightPx,
        },
        type: imageType,
        altText: {
          title: node.alt || 'Image',
          description: node.alt || '',
          name: node.alt || 'image',
        },
      });
    } catch (error) {
      console.warn('Failed to load image:', node.url, error);
      // Report progress even on error
      this.reportResourceProgress();

      // Fallback to text placeholder with more visible formatting
      return new TextRun({
        text: `[图片加载失败: ${node.alt || node.url}]`,
        italics: true,
        color: 'DC2626', // Red color to make it more visible
        bold: true,
      });
    }
  }

  /**
   * Extract ImageRun from a Paragraph returned by plugin.convertToDOCX
   * @param {Paragraph} paragraph - Paragraph containing ImageRun
   * @returns {ImageRun|TextRun} - Extracted ImageRun or error TextRun
   */
  /**
   * Convert code block node
   * Handles regular code blocks with syntax highlighting.
   * Special code blocks (diagrams, charts, etc.) are handled by plugins.
   */
  convertCodeBlock(node) {
    // Get syntax highlighted runs
    const runs = this.getHighlightedRunsForCode(node.value ?? '', node.lang);

    const codeBackground = this.themeStyles.characterStyles.code.background;
    
    return new Paragraph({
      children: runs,
      wordWrap: true, // Enable word wrap for long code lines
      alignment: AlignmentType.LEFT,
      spacing: this.applyPendingSpacing({
        before: 200, // 13px
        after: 200,  // 13px
        line: 276,   // 1.15 line height for code blocks
      }),
      shading: {
        fill: codeBackground,
      },
      border: {
        top: { color: 'E1E4E8', space: 10, value: BorderStyle.SINGLE, size: 6 },
        bottom: { color: 'E1E4E8', space: 10, value: BorderStyle.SINGLE, size: 6 },
        left: { color: 'E1E4E8', space: 10, value: BorderStyle.SINGLE, size: 6 },
        right: { color: 'E1E4E8', space: 10, value: BorderStyle.SINGLE, size: 6 },
      },
    });
  }

  /**
   * Convert HTML node
   * Returns a simple placeholder for HTML content that no plugin handles.
   */
  convertHtml(node) {
    return new Paragraph({
      children: [
        new TextRun({
          text: '[HTML Content]',
          italics: true,
          color: '666666',
        }),
      ],
      alignment: AlignmentType.LEFT,
      spacing: this.applyPendingSpacing({ before: 120, after: 120 }),
    });
  }

  /**
   * Convert list node
   */
  async convertList(node) {
    const items = [];

    // Assign a unique instance number for this list to restart numbering
    const listInstance = this.listInstanceCounter++;

    for (const item of node.children) {
      const converted = await this.convertListItem(node.ordered, item, 0, listInstance);
      if (converted) {
        items.push(...converted);
      }
    }

    return items;
  }

  /**
   * Convert list item node
   */
  async convertListItem(ordered, node, level, listInstance) {
    const items = [];

    // Check if this is a task list item (GFM extension)
    const isTaskList = node.checked !== null && node.checked !== undefined;

    for (const child of node.children) {
      if (child.type === 'paragraph') {
        const children = await this.convertInlineNodes(child.children);

        // For task lists, prepend checkbox symbol
        if (isTaskList) {
          const checkboxSymbol = node.checked ? '▣' : '☐';  // ▣ for checked, ☐ for unchecked
          const bodyFont = this.themeStyles.default.run.font;
          const bodySize = this.themeStyles.default.run.size;
          children.unshift(new TextRun({
            text: checkboxSymbol + ' ',
            font: bodyFont,
            size: bodySize,
          }));
        }

        // Get spacing from theme
        const defaultLineSpacing = this.themeStyles.default.paragraph.spacing.line;
        
        const paragraphConfig = {
          children: children,
          spacing: this.applyPendingSpacing({
            after: 45,  // 3px spacing between items (hardcoded for now)
            line: defaultLineSpacing,
          }),
          alignment: AlignmentType.LEFT, // Explicitly set left alignment for list items
        };

        // Use numbering for ordered lists, bullet for unordered lists
        // Task lists use bullet points
        if (ordered && !isTaskList) {
          paragraphConfig.numbering = {
            reference: 'default-ordered-list',
            level: level,
            instance: listInstance, // Add instance to restart numbering for each list
          };
        } else {
          paragraphConfig.bullet = {
            level: level,
          };
        }

        items.push(new Paragraph(paragraphConfig));
      } else if (child.type === 'list') {
        // Nested list - use same instance for nested lists
        for (const nestedItem of child.children) {
          items.push(...await this.convertListItem(child.ordered, nestedItem, level + 1, listInstance));
        }
      }
    }

    return items;
  }

  /**
   * Convert blockquote node
   */
  /**
   * Convert blockquote node
   * @param {number} nestLevel - Nesting level for indentation (0 = top level)
   */
  async convertBlockquote(node, nestLevel = 0) {
    const paragraphs = [];

    // Calculate indentation based on nesting level
    // Base indent for first level: 0.3" (same as second level would have been)
    // Each nesting level adds 0.3 inch
    const outerIndent = 0.3 + (nestLevel * 0.3);  // Start at 0.3", add 0.3" per level

    // Calculate total width added by borders and padding on left side
    // Left border: 3pt (24/8) ≈ 0.04", Left space: 6pt ≈ 0.09"
    // Total left side ≈ 0.13 inch
    const leftBorderAndPadding = 0.13;

    // Calculate total width added by right padding
    // Right space: 6pt ≈ 0.09"
    const rightBorderAndPadding = 0.09;

    const defaultLineSpacing = this.themeStyles.default.paragraph.spacing.line;

    // Build common paragraph config
    const buildParagraphConfig = (children, spacingBefore = 0, spacingAfter = 0) => ({
      children: children,
      spacing: this.applyPendingSpacing({
        before: spacingBefore,
        after: spacingAfter,
        line: defaultLineSpacing,
      }),
      alignment: AlignmentType.LEFT,
      indent: {
        left: convertInchesToTwip(outerIndent - leftBorderAndPadding),
        right: convertInchesToTwip(rightBorderAndPadding),
      },
      border: {
        left: {
          color: 'DFE2E5',
          space: 6,
          style: BorderStyle.SINGLE,
          size: 24,
        },
        top: {
          color: 'F6F8FA',
          space: 4,
          style: BorderStyle.SINGLE,
          size: 1,
        },
        bottom: {
          color: 'F6F8FA',
          space: 4,
          style: BorderStyle.SINGLE,
          size: 1,
        },
        right: {
          color: 'F6F8FA',
          space: 6,
          style: BorderStyle.SINGLE,
          size: 1,
        },
      },
      shading: {
        fill: 'F6F8FA',
      },
    });

    const childCount = node.children.length;
    let childIndex = 0;

    for (const child of node.children) {
      if (child.type === 'paragraph') {
        const children = await this.convertInlineNodes(child.children, { color: '6A737D' });
        
        // Only top-level blockquote (nestLevel === 0) gets spacing
        const isFirst = (childIndex === 0) && (nestLevel === 0);
        const isLast = (childIndex === childCount - 1) && (nestLevel === 0);
        const spacingBefore = isFirst ? 200 : 0;  // 13px
        const spacingAfter = isLast ? 300 : 0;    // 13px
        
        paragraphs.push(new Paragraph(buildParagraphConfig(children, spacingBefore, spacingAfter)));
        childIndex++;
      } else if (child.type === 'blockquote') {
        // Handle nested blockquotes with increased nesting level
        const nested = await this.convertBlockquote(child, nestLevel + 1);
        paragraphs.push(...nested);
        childIndex++;
      }
    }

    return paragraphs;
  }

  /**
   * Convert table node
   */
  async convertTable(node) {
    const rows = [];
    const alignments = node.align || [];
    const tableRows = node.children.filter((row) => row.type === 'tableRow');
    const rowCount = tableRows.length;
    
    // Get table styles from theme
    const tableStyles = this.themeStyles.tableStyles;

    // Process rows
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const row = tableRows[rowIndex];
      const isHeaderRow = rowIndex === 0;
      const isLastRow = rowIndex === rowCount - 1;
      
      if (row.type === 'tableRow') {
        const cells = [];

        for (let colIndex = 0; colIndex < row.children.length; colIndex++) {
          const cell = row.children[colIndex];

          if (cell.type === 'tableCell') {
            // For header row, apply header style
            const isBold = isHeaderRow && tableStyles.header.bold;
            const children = isBold
              ? await this.convertInlineNodes(cell.children, { bold: true, size: 20 })
              : await this.convertInlineNodes(cell.children, { size: 20 });
            
            const cellAlignment = alignments[colIndex];
            let paragraphAlignment = AlignmentType.LEFT;
            if (isHeaderRow) {
              paragraphAlignment = AlignmentType.CENTER;
            } else if (cellAlignment === 'center') {
              paragraphAlignment = AlignmentType.CENTER;
            } else if (cellAlignment === 'right') {
              paragraphAlignment = AlignmentType.RIGHT;
            }

            const cellConfig = {
              children: [new Paragraph({
                children: children,
                alignment: paragraphAlignment,
                spacing: { before: 60, after: 60, line: 240 },
              })],
              verticalAlign: VerticalAlignTable.CENTER,
              margins: tableStyles.cell.margins,
            };

            // Apply cell borders based on borderMode
            // Different strategies for hiding borders:
            // - Left border: SINGLE size:0 (prevents artifacts at leftmost edge)
            // - Inside vertical borders: NONE (cleaner for internal columns)
            // - Horizontal borders: SINGLE size:0 (consistent hiding)
            const whiteLeftBorder = { style: BorderStyle.SINGLE, size: 0, color: 'FFFFFF' };
            const whiteInsideVerticalBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
            const whiteHorizontalBorder = { style: BorderStyle.SINGLE, size: 0, color: 'FFFFFF' };
            
            const borderMode = tableStyles.borderMode || 'full-borders';
            const isFirstColumn = colIndex === 0;
            
            // Step 1: Set base borders according to borderMode
            cellConfig.borders = {};
            
            if (borderMode === 'no-borders') {
              // No borders: hide all borders
              cellConfig.borders = {
                top: whiteHorizontalBorder,
                bottom: whiteHorizontalBorder,
                left: isFirstColumn ? whiteLeftBorder : whiteInsideVerticalBorder,
                right: whiteInsideVerticalBorder
              };
            } else if (borderMode === 'horizontal-only') {
              // Horizontal-only: hide vertical borders, show horizontal
              cellConfig.borders = {
                top: whiteHorizontalBorder,
                bottom: whiteHorizontalBorder,
                left: isFirstColumn ? whiteLeftBorder : whiteInsideVerticalBorder,
                right: whiteInsideVerticalBorder
              };
            } else {
              // Full borders: apply all borders from config
              if (tableStyles.borders.top) {
                cellConfig.borders.top = tableStyles.borders.top;
              }
              if (tableStyles.borders.bottom) {
                cellConfig.borders.bottom = tableStyles.borders.bottom;
              }
              if (tableStyles.borders.left) {
                cellConfig.borders.left = tableStyles.borders.left;
              }
              if (tableStyles.borders.right) {
                cellConfig.borders.right = tableStyles.borders.right;
              }
            }
            
            // Step 2: Apply special borders (override base borders for all modes)
            if (isHeaderRow && tableStyles.borders.headerTop && tableStyles.borders.headerTop.style !== BorderStyle.NONE) {
              cellConfig.borders.top = tableStyles.borders.headerTop;
            }
            if (isHeaderRow && tableStyles.borders.headerBottom && tableStyles.borders.headerBottom.style !== BorderStyle.NONE) {
              cellConfig.borders.bottom = tableStyles.borders.headerBottom;
            }
            // For data rows: lastRowBottom takes precedence over insideHorizontal
            if (!isHeaderRow) {
              if (isLastRow && tableStyles.borders.lastRowBottom && tableStyles.borders.lastRowBottom.style !== BorderStyle.NONE) {
                cellConfig.borders.bottom = tableStyles.borders.lastRowBottom;
              } else if (tableStyles.borders.insideHorizontal && tableStyles.borders.insideHorizontal.style !== BorderStyle.NONE) {
                // insideHorizontal applies to all data rows (including last row if no lastRowBottom)
                cellConfig.borders.bottom = tableStyles.borders.insideHorizontal;
              }
            }
            
            // Apply shading
            if (isHeaderRow && tableStyles.header.shading) {
              cellConfig.shading = tableStyles.header.shading;
            } else if (tableStyles.zebra && rowIndex > 0) {
              // Invert zebra stripe logic: odd rows (1st, 3rd, 5th data row) use even color
              const isOddDataRow = ((rowIndex - 1) % 2) === 0;
              const background = isOddDataRow ? tableStyles.zebra.odd : tableStyles.zebra.even;
              if (background !== 'ffffff' && background !== 'FFFFFF') {
                cellConfig.shading = { fill: background };
              }
            }

            cells.push(new TableCell(cellConfig));
          }
        }

        rows.push(new TableRow({
          children: cells,
          tableHeader: isHeaderRow,
        }));
      }
    }

    // Create table with no table-level borders at all
    const table = new Table({
      rows: rows,
      layout: TableLayoutType.AUTOFIT,
      alignment: AlignmentType.CENTER,
    });

    return table;
  }

  /**
   * Convert thematic break (horizontal rule)
   */
  convertThematicBreak() {
    // Use paragraph with bottom border to create horizontal line
    // Double the thickness and use lighter color
    return new Paragraph({
      text: '',
      alignment: AlignmentType.LEFT, // Explicitly set left alignment
      spacing: {
        before: 300,  // 20px spacing before
        after: 300,   // 20px spacing after
        line: 120,    // Exact line height: 6pt
        lineRule: 'exact',  // Use exact line height
      },
      border: {
        bottom: {
          color: 'E1E4E8',      // Lighter gray color (was default dark gray)
          space: 1,
          style: BorderStyle.SINGLE,
          size: 12,             // 12 = 1.5pt (double the default ~0.75pt), roughly 2px
        },
      },
    });
  }

  /**
   * Convert math block (display math)
   */
  async convertMathBlock(node) {
    try {
      // Use library to convert LaTeX to docx math (with preprocessing)
      const math = convertLatex2Math(node.value);

      return new Paragraph({
        children: [math],
        spacing: this.applyPendingSpacing({
          before: 120, // 6pt
          after: 120,  // 6pt
        }),
        alignment: AlignmentType.CENTER,
      });
    } catch (error) {
      console.warn('Math conversion error:', error);
      // Fallback: display as code text
      const codeStyle = this.themeStyles.characterStyles.code;
      return new Paragraph({
        children: [
          new TextRun({
            text: node.value,
            font: codeStyle.font,
            size: codeStyle.size,
          }),
        ],
        alignment: AlignmentType.LEFT, // Explicitly set left alignment for error fallback
        spacing: this.applyPendingSpacing({ before: 120, after: 120 }),
      });
    }
  }

  /**
   * Convert inline math
   */
  async convertInlineMath(node, parentStyle) {
    try {
      // Use library to convert LaTeX to docx math (with preprocessing)
      const math = convertLatex2Math(node.value);
      return math;
    } catch (error) {
      console.warn('Inline math conversion error:', error);
      // Fallback: display as code text
      const codeStyle = this.themeStyles.characterStyles.code;
      return new TextRun({
        text: node.value,
        font: codeStyle.font,
        size: codeStyle.size,
        ...parentStyle,
      });
    }
  }

  /**
   * Extract plain text from node and its children
   */
  extractText(node) {
    let text = '';

    if (node.value) {
      return node.value;
    }

    if (node.children) {
      for (const child of node.children) {
        text += this.extractText(child);
      }
    }

    return text;
  }

  /**
   * Download blob as file
   */
  async downloadBlob(blob, filename) {
    let token = null;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const uploadResult = await uploadInChunks({
        sendMessage: (payload) => this.runtimeSendMessage(payload),
        purpose: 'docx-download',
        encoding: 'base64',
        totalSize: bytes.length,
        metadata: {
          filename,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        },
        getChunk: (offset, size) => {
          const end = Math.min(offset + size, bytes.length);
          const chunkBytes = bytes.subarray(offset, end);
          return this.encodeBytesToBase64(chunkBytes);
        }
      });

      token = uploadResult.token;

      const finalizeResponse = await this.runtimeSendMessage({
        type: 'DOCX_DOWNLOAD_FINALIZE',
        token
      });

      if (!finalizeResponse || !finalizeResponse.success) {
        throw new Error(finalizeResponse?.error || 'Download finalize failed');
      }
    } catch (error) {
      console.error('Download failed:', error);
      if (token) {
        abortUpload((payload) => this.runtimeSendMessage(payload), token);
      }
      this.fallbackDownload(blob, filename);
    }
  }

  /**
   * Convert byte array chunk to base64 without exceeding call stack limits
   * @param {Uint8Array} bytes - Binary chunk
   * @returns {string} Base64 encoded chunk
   */
  encodeBytesToBase64(bytes) {
    let binary = '';
    const sliceSize = 0x8000;
    for (let i = 0; i < bytes.length; i += sliceSize) {
      const slice = bytes.subarray(i, Math.min(i + sliceSize, bytes.length));
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  /**
   * Wrapper for chrome.runtime.sendMessage with Promise interface
   * @param {Object} message - Message payload
   * @returns {Promise<any>} - Response from background script
   */
  runtimeSendMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Fallback download method using <a> element
   */
  fallbackDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}

export default DocxExporter;
