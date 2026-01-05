#!/usr/bin/env node

/**
 * Check missing translation keys across all locale files
 * and verify key usage in source code
 * Usage: node check-missing-keys.js
 */

import fs from 'fs';
import path from 'path';
import { findI18nKeysInCode } from './shared/find-i18n-keys-in-code.js';

const LOCALES_DIR = path.join(import.meta.dirname, '../src/_locales');

// Get all locale directories
function getLocaleDirs() {
  return fs.readdirSync(LOCALES_DIR)
    .filter(file => {
      const fullPath = path.join(LOCALES_DIR, file);
      return fs.statSync(fullPath).isDirectory() && file !== 'node_modules';
    })
    .sort();
}

// Load messages.json from a locale directory
function loadMessages(locale) {
  const messagesPath = path.join(LOCALES_DIR, locale, 'messages.json');
  try {
    const content = fs.readFileSync(messagesPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading ${locale}/messages.json:`, error.message);
    return null;
  }
}

// Get all keys from a messages object
function getKeys(messages) {
  return Object.keys(messages).sort();
}

// Find all translation key references in source code
function findKeysInCode() {
  return findI18nKeysInCode();
}

// Main function
function main() {
  const locales = getLocaleDirs();
  
  // Load all locales and collect all keys
  const localeData = new Map();
  const allKeys = new Set();
  
  locales.forEach(locale => {
    const messages = loadMessages(locale);
    if (messages) {
      const keys = getKeys(messages);
      localeData.set(locale, new Set(keys));
      keys.forEach(key => allKeys.add(key));
    }
  });
  
  const allKeysArray = Array.from(allKeys).sort();
  
  // Find which keys are missing in which locales
  const missingKeysMap = new Map(); // key -> Set of locales missing this key
  
  allKeysArray.forEach(key => {
    const missingLocales = new Set();
    locales.forEach(locale => {
      const keys = localeData.get(locale);
      if (keys && !keys.has(key)) {
        missingLocales.add(locale);
      }
    });
    
    if (missingLocales.size > 0) {
      missingKeysMap.set(key, missingLocales);
    }
  });
  
  // Display missing keys table
  if (missingKeysMap.size > 0) {
    console.log('❌ Missing translations:');
    missingKeysMap.forEach((localesSet, key) => {
      const localesList = Array.from(localesSet).sort().join(', ');
      console.log(`   ${key}: ${localesList}`);
    });
    console.log(`\n🛠️  Fix: node scripts/update-locale-keys.js\n`);
  }
  
  // Check for unused and undefined keys
  const usedKeys = findKeysInCode();
  
  // Keys defined but not used
  const definedKeys = allKeysArray;
  const unusedKeys = definedKeys.filter(key => !usedKeys.all.has(key));

  if (unusedKeys.length > 0) {
    console.log(`⚠️  ${unusedKeys.length} unused key(s):`);
    unusedKeys.forEach(key => console.log(`   ${key}`));
    console.log(`\n🛠️  Fix: node scripts/cleanup-unused-keys.js\n`);
  }
  
  // Keys used but not defined
  const undefinedKeys = Array.from(usedKeys.all).filter(key => !allKeys.has(key));
  
  if (undefinedKeys.length > 0) {
    console.log(`❌ ${undefinedKeys.length} undefined key(s):`);
    undefinedKeys.forEach(key => console.log(`   ${key}`));
    console.log(`\n🛠️  Fix: node scripts/update-locale-keys.js\n`);
  }
  
  // Summary
  const hasIssues = missingKeysMap.size > 0 || unusedKeys.length > 0 || undefinedKeys.length > 0;
  
  if (hasIssues) {
    console.log(`📊 ${definedKeys.length} keys | ${missingKeysMap.size} missing | ${unusedKeys.length} unused | ${undefinedKeys.length} undefined\n`);
  } else {
    console.log(`✅ All ${definedKeys.length} translation keys OK\n`);
  }
}

// Run the script
main();
