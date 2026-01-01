/**
 * Internationalization helpers for popup
 */

import Localization, { DEFAULT_SETTING_LOCALE } from '../../utils/localization';

/**
 * Translate a key to localized string
 * @param key - Translation key
 * @param substitutions - Optional substitutions
 * @returns Translated string
 */
export const translate = (key: string, substitutions?: string | string[]): string => 
  Localization.translate(key, substitutions);

/**
 * Get the current UI locale
 * @returns Locale code (e.g., 'en', 'zh-CN')
 */
export const getUiLocale = (): string => {
  const selectedLocale = Localization.getLocale();
  if (selectedLocale && selectedLocale !== DEFAULT_SETTING_LOCALE) {
    return selectedLocale.replace('_', '-');
  }

  if (chrome?.i18n?.getUILanguage) {
    return chrome.i18n.getUILanguage();
  }
  return 'en';
};

/**
 * Apply internationalized text to DOM elements
 * Elements with data-i18n attribute will have their text content replaced
 * Elements with data-i18n-attr attribute will have specified attributes set
 */
export const applyI18nText = (): void => {
  // Handle text content
  const elements = document.querySelectorAll<HTMLElement>('[data-i18n]');
  elements.forEach((element) => {
    const key = element.dataset.i18n;
    const i18nArgs = element.dataset.i18nArgs;
    
    if (!key) return;
    
    let substitutions: string[] | undefined;

    if (i18nArgs) {
      substitutions = i18nArgs.split('|');
    }

    let message = translate(key, substitutions);
    if (message && substitutions) {
      const list = Array.isArray(substitutions) ? substitutions : [substitutions];
      message = message.replace(/\{(\d+)\}/g, (match, index) => {
        const idx = Number.parseInt(index, 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= list.length) {
          return match;
        }
        return list[idx];
      });
    }

    if (message) {
      element.textContent = message;
    }
  });

  // Handle attribute translations
  const attributeElements = document.querySelectorAll<HTMLElement>('[data-i18n-attr]');
  attributeElements.forEach((element) => {
    const mapping = element.dataset.i18nAttr;
    if (!mapping) {
      return;
    }

    mapping.split(',').forEach((pair) => {
      const [attrRaw, key] = pair.split(':');
      if (!attrRaw || !key) {
        return;
      }

      const attrName = attrRaw.trim();
      const message = translate(key.trim());
      if (attrName && message) {
        element.setAttribute(attrName, message);
      }
    });
  });
};
