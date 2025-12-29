/**
 * Platform Shared Base Services
 * 
 * Common base implementations that can be extended by platform-specific code.
 * These classes provide default implementations for cross-platform functionality.
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Single locale message entry
 */
export interface LocaleMessageEntry {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string; example?: string }>;
}

/**
 * Locale messages object
 */
export interface LocaleMessages {
  [key: string]: LocaleMessageEntry;
}

// ============================================================================
// Base I18n Service
// ============================================================================

export const DEFAULT_SETTING_LOCALE = 'auto';
export const FALLBACK_LOCALE = 'en';

/**
 * Base i18n service with common message lookup logic.
 * Platform-specific implementations should extend this.
 */
export class BaseI18nService {
  protected messages: LocaleMessages | null = null;
  protected fallbackMessages: LocaleMessages | null = null;
  protected locale: string = DEFAULT_SETTING_LOCALE;
  protected ready: boolean = false;

  constructor() {
    this.messages = null;
    this.fallbackMessages = null;
    this.locale = DEFAULT_SETTING_LOCALE;
    this.ready = false;
  }

  /**
   * Initialize the i18n service
   */
  async init(): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Get current locale
   * @returns Current locale code
   */
  getLocale(): string {
    return this.locale;
  }

  /**
   * Set preferred locale
   * @param locale - Locale code or 'auto'
   */
  async setLocale(locale: string): Promise<void> {
    const normalized = locale || DEFAULT_SETTING_LOCALE;
    if (normalized === DEFAULT_SETTING_LOCALE) {
      this.messages = null;
      this.locale = DEFAULT_SETTING_LOCALE;
    } else {
      await this.loadLocale(normalized);
      this.locale = normalized;
    }
    this.ready = Boolean(this.messages || this.fallbackMessages);
  }

  /**
   * Load locale data (must be implemented by subclass)
   * @param locale - Locale code
   */
  async loadLocale(locale: string): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Ensure fallback messages are loaded
   */
  async ensureFallbackMessages(): Promise<void> {
    if (this.fallbackMessages) return;
    this.fallbackMessages = await this.fetchLocaleData(FALLBACK_LOCALE);
  }

  /**
   * Fetch locale data (must be implemented by subclass)
   * @param locale - Locale code
   * @returns Locale messages object
   */
  async fetchLocaleData(locale: string): Promise<LocaleMessages | null> {
    throw new Error('Not implemented');
  }

  /**
   * Translate a message key
   * @param key - Message key
   * @param substitutions - Replacement values
   * @returns Translated message
   */
  translate(key: string, substitutions?: string | string[]): string {
    if (!key) return '';

    // Try user-selected messages first
    const value = this.lookupMessage(this.messages, key, substitutions);
    if (value !== null) return value;

    // Try fallback messages
    const fallbackValue = this.lookupMessage(this.fallbackMessages, key, substitutions);
    if (fallbackValue !== null) return fallbackValue;

    return '';
  }

  /**
   * Lookup message in source with substitutions
   * @param source - Messages object
   * @param key - Message key
   * @param substitutions - Replacement values
   * @returns Message or null if not found
   */
  lookupMessage(source: LocaleMessages | null, key: string, substitutions?: string | string[]): string | null {
    if (!source || !source[key]) return null;

    const template = source[key].message || '';
    if (!template) return '';
    if (!substitutions) return template;

    const list = Array.isArray(substitutions) ? substitutions : [substitutions];
    return template.replace(/\{(\d+)\}/g, (match, index) => {
      const idx = parseInt(index, 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= list.length) {
        return match;
      }
      return list[idx];
    });
  }
}
