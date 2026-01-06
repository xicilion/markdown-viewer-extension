/**
 * Line-Based Scroll Manager
 * 
 * Scroll synchronization based on block IDs and source line numbers.
 * Uses MarkdownDocument for line mapping, DOM only for pixel calculations.
 */

/**
 * Interface for document line mapping (provided by MarkdownDocument)
 */
export interface LineMapper {
  /** Convert blockId + progress to source line number */
  getLineFromBlockId(blockId: string, progress: number): number | null;
  /** Convert source line to blockId + progress */
  getBlockPositionFromLine(line: number): { blockId: string; progress: number } | null;
}

/**
 * Options for scroll operations
 */
export interface ScrollOptions {
  /** Content container element */
  container: HTMLElement;
  /** Whether using window scroll (true for Chrome) or container scroll (false for VSCode) */
  useWindowScroll?: boolean;
  /** Scroll behavior */
  behavior?: ScrollBehavior;
}

/**
 * Find the block element at current scroll position
 * @returns blockId and progress (0-1) within that block
 */
export function getBlockAtScrollPosition(options: ScrollOptions): { blockId: string; progress: number } | null {
  const { container, useWindowScroll = true } = options;
  
  // Get all block elements
  const blocks = container.querySelectorAll<HTMLElement>('[data-block-id]');
  if (blocks.length === 0) return null;
  
  // Get current scroll position
  let scrollTop: number;
  let viewportTop: number;
  
  if (useWindowScroll) {
    scrollTop = window.scrollY || window.pageYOffset || 0;
    viewportTop = 0;
  } else {
    scrollTop = container.scrollTop;
    viewportTop = container.getBoundingClientRect().top;
  }
  
  // Find the block containing current scroll position
  let targetBlock: HTMLElement | null = null;
  
  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    const blockTop = useWindowScroll 
      ? rect.top + scrollTop 
      : rect.top - viewportTop + scrollTop;
    
    if (blockTop > scrollTop) {
      break;
    }
    targetBlock = block;
  }
  
  if (!targetBlock) {
    targetBlock = blocks[0] as HTMLElement;
  }
  
  const blockId = targetBlock.getAttribute('data-block-id');
  if (!blockId) return null;
  
  // Calculate progress within block
  const rect = targetBlock.getBoundingClientRect();
  const blockTop = useWindowScroll 
    ? rect.top + scrollTop 
    : rect.top - viewportTop + scrollTop;
  const blockHeight = rect.height;
  
  const pixelOffset = scrollTop - blockTop;
  const progress = blockHeight > 0 ? Math.max(0, Math.min(1, pixelOffset / blockHeight)) : 0;
  
  return { blockId, progress };
}

/**
 * Scroll to a specific block with progress
 * @returns true if scroll was performed
 */
export function scrollToBlock(
  blockId: string, 
  progress: number, 
  options: ScrollOptions
): boolean {
  const { container, useWindowScroll = true, behavior = 'auto' } = options;
  
  // Find the block element
  const block = container.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
  if (!block) return false;
  
  // Get current scroll context
  let currentScroll: number;
  let viewportTop: number;
  
  if (useWindowScroll) {
    currentScroll = window.scrollY || window.pageYOffset || 0;
    viewportTop = 0;
  } else {
    currentScroll = container.scrollTop;
    viewportTop = container.getBoundingClientRect().top;
  }
  
  // Calculate target scroll position
  const rect = block.getBoundingClientRect();
  const blockTop = useWindowScroll 
    ? rect.top + currentScroll 
    : rect.top - viewportTop + currentScroll;
  const blockHeight = rect.height;
  
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const scrollTo = blockTop + clampedProgress * blockHeight;
  
  // Perform scroll
  if (useWindowScroll) {
    window.scrollTo({ top: Math.max(0, scrollTo), behavior });
  } else {
    container.scrollTo({ top: Math.max(0, scrollTo), behavior });
  }
  
  return true;
}

/**
 * Get current scroll position as source line number
 * Returns null if no blocks in DOM or lineMapper unavailable
 */
export function getLineForScrollPosition(
  lineMapper: LineMapper | null | undefined,
  options: ScrollOptions
): number | null {
  if (!lineMapper) return null;
  
  const pos = getBlockAtScrollPosition(options);
  if (!pos) return null;
  
  return lineMapper.getLineFromBlockId(pos.blockId, pos.progress);
}

/**
 * Scroll to reveal a specific source line
 * @returns true if scroll was performed
 */
export function scrollToLine(
  line: number, 
  lineMapper: LineMapper | null | undefined,
  options: ScrollOptions
): boolean {
  const { container, useWindowScroll = true, behavior = 'auto' } = options;
  
  // Special case: line <= 0 means scroll to top
  if (line <= 0) {
    if (useWindowScroll) {
      window.scrollTo({ top: 0, behavior });
    } else {
      container.scrollTo({ top: 0, behavior });
    }
    return true;
  }
  
  // If no lineMapper, can't scroll to line
  if (!lineMapper) return false;
  
  const pos = lineMapper.getBlockPositionFromLine(line);
  if (!pos) return false;
  
  return scrollToBlock(pos.blockId, pos.progress, options);
}

/**
 * Scroll sync controller interface
 */
export interface ScrollSyncController {
  /** Set target line from source (e.g., editor) */
  setTargetLine(line: number): void;
  /** Get current scroll position as line number */
  getCurrentLine(): number | null;
  /** Reset target line to 0 (call when document changes) */
  resetTargetLine(): void;
  /** Start the controller */
  start(): void;
  /** Stop and cleanup */
  dispose(): void;
}

/**
 * Options for scroll sync controller
 */
export interface ScrollSyncControllerOptions {
  /** Content container element */
  container: HTMLElement;
  /** Line mapper getter (called each time to get latest document state) */
  getLineMapper: () => LineMapper;
  /** Whether using window scroll (true for Chrome) or container scroll (false for VSCode) */
  useWindowScroll?: boolean;
  /** Callback when user scrolls (for reverse sync) */
  onUserScroll?: (line: number) => void;
  /** Debounce time for user scroll callback (ms) */
  userScrollDebounceMs?: number;
}

/**
 * Create a scroll sync controller
 */
export function createScrollSyncController(options: ScrollSyncControllerOptions): ScrollSyncController {
  const {
    container,
    getLineMapper,
    useWindowScroll = false,
    onUserScroll,
    userScrollDebounceMs = 50,
  } = options;

  let targetLine: number = 0;
  let lastProgrammaticScrollTime = 0;  // Timestamp of last programmatic scroll
  const SCROLL_LOCK_DURATION = 50;     // Ignore scroll events for 50ms after programmatic scroll
  let userScrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastContentHeight = 0;
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let disposed = false;

  const scrollOptions: ScrollOptions = {
    container,
    useWindowScroll,
  };

  const getScrollTarget = (): HTMLElement | Window => {
    return useWindowScroll ? window : container;
  };

  /**
   * Perform programmatic scroll and mark timestamp
   */
  const doScroll = (line: number): void => {
    lastProgrammaticScrollTime = Date.now();
    scrollToLine(line, getLineMapper(), scrollOptions);
  };

  /**
   * Handle scroll event - skip if within lock duration after programmatic scroll
   */
  const handleScroll = (): void => {
    if (disposed) return;

    // Always update targetLine to track current position (even during lock)
    // This ensures async rendering repositions to the correct location
    const currentLine = getLineForScrollPosition(getLineMapper(), scrollOptions);
    if (currentLine !== null && !isNaN(currentLine)) {
      targetLine = currentLine;
    }

    // Skip reporting user scroll if within lock duration after programmatic scroll
    if (Date.now() - lastProgrammaticScrollTime < SCROLL_LOCK_DURATION) {
      return;
    }

    // User-initiated scroll - report position for reverse sync
    if (!onUserScroll) return;

    if (currentLine !== null && !isNaN(currentLine)) {
      if (userScrollDebounceTimer) clearTimeout(userScrollDebounceTimer);
      userScrollDebounceTimer = setTimeout(() => {
        if (!disposed) {
          onUserScroll(currentLine);
        }
      }, userScrollDebounceMs);
    }
  };

  const checkAndReposition = (): void => {
    if (disposed) return;

    const currentHeight = container.scrollHeight;
    if (currentHeight !== lastContentHeight) {
      lastContentHeight = currentHeight;
      doScroll(targetLine);
    }
  };

  const setupListeners = (): void => {
    const target = getScrollTarget();

    // Listen to all scroll events
    target.addEventListener('scroll', handleScroll, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        lastProgrammaticScrollTime = Date.now();  // Lock immediately, before rAF
        requestAnimationFrame(checkAndReposition);
      });
      resizeObserver.observe(container);
      
      const contentEl = container.querySelector('#markdown-content');
      if (contentEl) {
        resizeObserver.observe(contentEl);
      }
    }

    mutationObserver = new MutationObserver(() => {
      lastProgrammaticScrollTime = Date.now();  // Lock immediately, before rAF
      requestAnimationFrame(checkAndReposition);
    });
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });
  };

  const removeListeners = (): void => {
    const target = getScrollTarget();

    target.removeEventListener('scroll', handleScroll);

    resizeObserver?.disconnect();
    mutationObserver?.disconnect();

    if (userScrollDebounceTimer) clearTimeout(userScrollDebounceTimer);
  };

  return {
    setTargetLine(line: number): void {
      targetLine = line;
      doScroll(line);
      lastContentHeight = container.scrollHeight;
    },

    getCurrentLine(): number | null {
      return getLineForScrollPosition(getLineMapper(), scrollOptions);
    },

    resetTargetLine(): void {
      targetLine = 0;
      lastContentHeight = 0;
      lastProgrammaticScrollTime = Date.now();  // Lock scroll events during file switch
    },

    start(): void {
      if (disposed) return;
      setupListeners();
      lastContentHeight = container.scrollHeight;
    },

    dispose(): void {
      disposed = true;
      removeListeners();
    },
  };
}
