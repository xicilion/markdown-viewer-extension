#!/usr/bin/env node

/**
 * Check missing translation keys across all locale files
 * Usage: node check-missing-keys.js
 */

import fs from 'fs';
import path from 'path';

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

// Main function
function main() {
  console.log('🔍 Checking translation keys across all locales...\n');
  
  const locales = getLocaleDirs();
  console.log(`Found locales: ${locales.join(', ')}\n`);
  
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
  console.log(`📋 Total unique keys found across all locales: ${allKeysArray.length}\n`);
  
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
    console.log('❌ Missing Keys (by message key):');
    console.log('─'.repeat(80));
    
    const missingTable = {};
    missingKeysMap.forEach((localesSet, key) => {
      const row = { Key: key };
      locales.forEach(locale => {
        row[locale] = localesSet.has(locale) ? '❌' : '✅';
      });
      missingTable[key] = row;
    });
    
    console.table(Object.values(missingTable));
  }
  
  if (missingKeysMap.size === 0) {
    console.log('\n🎉 All locales are complete and synchronized!\n');
  } else {
    console.log(`\n⚠️  Found ${missingKeysMap.size} key(s) with missing translations.\n`);
  }
}

// Run the script
main();
