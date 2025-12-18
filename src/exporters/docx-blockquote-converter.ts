// Blockquote conversion for DOCX export
// Uses a single-cell table to create a true container that supports nested content

import {
  Paragraph,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  WidthType,
  TableLayoutType,
  convertInchesToTwip,
  type IParagraphOptions,
  type ParagraphChild,
  type FileChild,
} from 'docx';
import type { DOCXThemeStyles, DOCXBlockquoteNode, DOCXASTNode } from '../types/docx';
import type { InlineResult, InlineNode } from './docx-inline-converter';

type ConvertInlineNodesFunction = (children: InlineNode[], options?: { color?: string }) => Promise<InlineResult[]>;
type ConvertChildNodeFunction = (node: DOCXASTNode) => Promise<FileChild | FileChild[] | null>;

interface BlockquoteConverterOptions {
  themeStyles: DOCXThemeStyles;
  convertInlineNodes: ConvertInlineNodesFunction;
  convertChildNode?: ConvertChildNodeFunction;
}

export interface BlockquoteConverter {
  convertBlockquote(node: DOCXBlockquoteNode, nestLevel?: number): Promise<Table>;
  setConvertChildNode(fn: ConvertChildNodeFunction): void;
}

// Blockquote style constants
const BLOCKQUOTE_STYLES = {
  leftBorderColor: 'DFE2E5',
  leftBorderSize: 18,
};

/**
 * Create a blockquote converter using table-based approach
 * This allows true nesting and supports any content type inside blockquotes
 * @param options - Configuration options
 * @returns Blockquote converter
 */
export function createBlockquoteConverter({ themeStyles, convertInlineNodes, convertChildNode: initialConvertChildNode }: BlockquoteConverterOptions): BlockquoteConverter {
  const defaultSpacing = themeStyles.default?.paragraph?.spacing || { before: 0, line: 276 };
  const defaultLineSpacing = defaultSpacing.line ?? 276;
  
  // Calculate cell padding to compensate for line height bottom spacing
  // Word's line height adds extra space BELOW text (not evenly distributed)
  // So we need to add equivalent top padding to balance the visual appearance
  const lineSpacingExtra = defaultLineSpacing - 240; // Extra spacing from line height (240 = single line)
  const basePadding = 80;
  const cellPadding = {
    top: basePadding + lineSpacingExtra, // Compensate for full bottom spacing from line height
    bottom: 0,
    left: 200,
    right: 100,
  };

  // Mutable reference to convertChildNode (set later to avoid circular dependency)
  let convertChildNode: ConvertChildNodeFunction | undefined = initialConvertChildNode;

  /**
   * Set the convertChildNode function (called after all converters are initialized)
   */
  function setConvertChildNode(fn: ConvertChildNodeFunction): void {
    convertChildNode = fn;
  }

  /**
   * Convert a paragraph node inside blockquote
   */
  async function convertBlockquoteParagraph(child: DOCXASTNode, isFirst: boolean): Promise<Paragraph> {
    const children = await convertInlineNodes(child.children as InlineNode[]);
    
    const paragraphConfig: IParagraphOptions = {
      children: children as ParagraphChild[],
      spacing: { 
        before: isFirst ? 0 : 120, 
        after: 0, 
        line: defaultLineSpacing 
      },
      alignment: AlignmentType.LEFT,
    };
    
    return new Paragraph(paragraphConfig);
  }

  /**
   * Convert blockquote node to a DOCX Table (single-cell table as container)
   * @param node - Blockquote AST node
   * @param nestLevel - Current nesting level (default: 0)
   * @returns DOCX Table representing the blockquote
   */
  async function convertBlockquote(node: DOCXBlockquoteNode, nestLevel = 0): Promise<Table> {
    const cellChildren: FileChild[] = [];

    let isFirst = true;
    for (const child of node.children) {
      if (child.type === 'paragraph') {
        cellChildren.push(await convertBlockquoteParagraph(child, isFirst));
        isFirst = false;
      } else if (child.type === 'blockquote') {
        // Nested blockquote: recursively create another table
        const nestedTable = await convertBlockquote(child as DOCXBlockquoteNode, nestLevel + 1);
        cellChildren.push(nestedTable);
        isFirst = false;
      } else if (convertChildNode) {
        // Use generic converter for other node types (code, table, etc.)
        const converted = await convertChildNode(child);
        if (converted) {
          if (Array.isArray(converted)) {
            cellChildren.push(...converted);
          } else {
            cellChildren.push(converted);
          }
        }
        isFirst = false;
      }
    }

    // Ensure at least one paragraph in the cell (Word requirement)
    if (cellChildren.length === 0) {
      cellChildren.push(new Paragraph({ text: '' }));
    }

    // Create the table cell with blockquote styling
    const cell = new TableCell({
      children: cellChildren,
      margins: cellPadding,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.SINGLE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.SINGLE, size: 0, color: 'FFFFFF' },
        left: { 
          style: BorderStyle.SINGLE, 
          size: BLOCKQUOTE_STYLES.leftBorderSize, 
          color: BLOCKQUOTE_STYLES.leftBorderColor 
        },
      },
    });

    // Create single-row table
    const row = new TableRow({
      children: [cell],
    });

    // Create table with full width
    const table = new Table({
      rows: [row],
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      indent: {
        size: convertInchesToTwip(0.1 * nestLevel),
        type: WidthType.DXA,
      },
    });

    return table;
  }

  return { convertBlockquote, setConvertChildNode };
}
